import { describe, expect, it } from 'vitest';
import Prompt from '../models/prompt.model.js';
import { extractTemplateVariables, renderTemplate } from '../utils/template.util.js';
import { migratePromptVersions } from '../_migrations/add-prompt-versions.migration.js';
import { api, createPrompt, createUser } from './helpers.js';

const P = '/api/v1/prompts';

describe('template variables', () => {
  it('extracts unique names in order and renders values', () => {
    const text = 'Summarize {{ doc }} for {{audience}}. Again: {{doc}}. Not {{1bad}} or {{a-b}}.';
    expect(extractTemplateVariables(text)).toEqual(['doc', 'audience']);
    expect(renderTemplate(text, { doc: 'X' })).toEqual({
      rendered: 'Summarize X for {{audience}}. Again: X. Not {{1bad}} or {{a-b}}.',
      missing: ['audience'],
    });
  });
});

describe('prompt version history', () => {
  it('starts at v1 and records edits made through the normal update route', async () => {
    const { user, cookie } = await createUser();
    const prompt = await createPrompt(user._id, { promptText: 'Summarize {{text}} briefly.' });

    const edit = await api()
      .patch(`${P}/${prompt.id}`)
      .set('Cookie', cookie)
      .send({ promptText: 'Summarize {{text}} in {{n}} bullets.' });
    expect(edit.status).toBe(200);

    const res = await api().get(`${P}/${prompt.id}/versions`).set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.currentVersion).toBe(2);
    expect(res.body.data.versions.map((v: any) => v.versionNumber)).toEqual([2, 1]);
    expect(res.body.data.versions[0].templateVariables).toEqual(['text', 'n']);
  });

  it('saves explicit versions and restores old ones as a new version', async () => {
    const { user, cookie } = await createUser();
    const prompt = await createPrompt(user._id, { promptText: 'Original prompt text here.' });

    await api()
      .post(`${P}/${prompt.id}/versions`)
      .set('Cookie', cookie)
      .send({ promptText: 'Second draft of the prompt.', changeSummary: 'Tighter wording' })
      .expect(201);
    const same = await api()
      .post(`${P}/${prompt.id}/versions`)
      .set('Cookie', cookie)
      .send({ promptText: 'Second draft of the prompt.' });
    expect(same.status).toBe(400);

    const restored = await api().post(`${P}/${prompt.id}/versions/1/restore`).set('Cookie', cookie);
    expect(restored.status).toBe(201);
    expect(restored.body.data.currentVersion).toBe(3);
    expect(restored.body.data.versions[0].changeSummary).toBe('Restored version 1');

    const detail = await api().get(`${P}/${prompt.id}`);
    expect(detail.body.data.prompt.promptText).toBe('Original prompt text here.');
    expect(detail.body.data.prompt.currentVersion).toBe(3);
  });

  it('keeps history and test cases owner-only and out of public payloads', async () => {
    const { user, cookie } = await createUser();
    const { cookie: otherCookie } = await createUser();
    const prompt = await createPrompt(user._id);
    await api()
      .put(`${P}/${prompt.id}/test-cases`)
      .set('Cookie', cookie)
      .send({ testCases: [{ name: 'Secret case', variables: { text: 'confidential' } }] })
      .expect(200);

    expect((await api().get(`${P}/${prompt.id}/versions`).set('Cookie', otherCookie)).status).toBe(403);
    expect((await api().get(`${P}/${prompt.id}/versions`)).status).toBe(401);
    expect(
      (await api().post(`${P}/${prompt.id}/versions/1/restore`).set('Cookie', otherCookie)).status,
    ).toBe(403);

    const payloads = [
      (await api().get(P)).body,
      (await api().get(`${P}/${prompt.id}`)).body,
      (await api().post(`${P}/${prompt.id}/like`).set('Cookie', otherCookie)).body,
    ];
    for (const body of payloads) {
      const json = JSON.stringify(body);
      expect(json).not.toContain('"versions"');
      expect(json).not.toContain('confidential');
    }
  });
});

describe('test cases', () => {
  it('replaces and returns saved variable sets with validation', async () => {
    const { user, cookie } = await createUser();
    const prompt = await createPrompt(user._id, { promptText: 'Translate {{text}} into {{language}}.' });

    const bad = await api()
      .put(`${P}/${prompt.id}/test-cases`)
      .set('Cookie', cookie)
      .send({ testCases: [{ name: 'x', variables: { 'not-valid': 'y' } }] });
    expect(bad.status).toBe(400);

    await api()
      .put(`${P}/${prompt.id}/test-cases`)
      .set('Cookie', cookie)
      .send({
        testCases: [
          { name: 'French', variables: { text: 'Hello', language: 'French' }, expectedAssertions: ['Is in French'] },
        ],
      })
      .expect(200);

    const res = await api().get(`${P}/${prompt.id}/test-cases`).set('Cookie', cookie);
    expect(res.body.data.templateVariables).toEqual(['text', 'language']);
    expect(res.body.data.testCases[0]).toMatchObject({
      name: 'French',
      variables: { text: 'Hello', language: 'French' },
      expectedAssertions: ['Is in French'],
    });
  });
});

describe('prompt versions migration', () => {
  it('backfills v1 for legacy prompts idempotently', async () => {
    const { user } = await createUser();
    const prompt = await createPrompt(user._id, { promptText: 'Legacy {{thing}} prompt.' });
    await Prompt.collection.updateOne({ _id: prompt._id }, { $unset: { versions: '', currentVersion: '' } });

    expect((await migratePromptVersions()).matched).toBe(1);
    const migrated: any = await Prompt.findById(prompt._id).lean();
    expect(migrated.currentVersion).toBe(1);
    expect(migrated.versions[0]).toMatchObject({ versionNumber: 1, templateVariables: ['thing'] });
    expect((await migratePromptVersions()).matched).toBe(0);
  });
});
