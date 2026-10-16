import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { AppConfig } from '../types/config.types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../config.env') });

const getEnvVar = (
  key: string,
  required: boolean = true,
  defaultValue?: string,
): string | undefined => {
  const value = process.env[key];

  if (required && (value === undefined || value === null || value === '')) {
    console.error(
      `💥 FATAL ERROR: Required environment variable "${key}" is not set.`,
    );
    process.exit(1);
  }

  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }

  return value;
};

const getEnvVarAsInt = (
  key: string,
  required: boolean = true,
  defaultValue?: number,
): number | undefined => {
  const valueStr = getEnvVar(key, required, defaultValue?.toString());
  if (valueStr === undefined) return undefined;

  const valueInt = parseInt(valueStr, 10);
  if (isNaN(valueInt)) {
    console.error(
      `💥 FATAL ERROR: Environment variable "${key}" must be an integer! Found: ${valueStr}`,
    );
    process.exit(1);
  }
  return valueInt;
};

const getEnvVarAsFloat = (
  key: string,
  required: boolean = true,
  defaultValue?: number,
): number | undefined => {
  const valueStr = getEnvVar(key, required, defaultValue?.toString());
  if (valueStr === undefined) return undefined;

  const value = parseFloat(valueStr);
  if (isNaN(value)) {
    console.error(
      `💥 FATAL ERROR: Environment variable "${key}" must be a number! Found: ${valueStr}`,
    );
    process.exit(1);
  }
  return value;
};

const nodeEnv = getEnvVar('NODE_ENV', false, 'development');
const isProduction = nodeEnv === 'production';
const defaultLogLevel = isProduction ? 'info' : 'debug';

const config: AppConfig = {
  nodeEnv: nodeEnv as AppConfig['nodeEnv'],
  isProduction: isProduction,
  port: getEnvVarAsInt('PORT', true, 3000)!,
  logLevel: getEnvVar(
    'LOG_LEVEL',
    false,
    defaultLogLevel,
  ) as AppConfig['logLevel'],

  corsOrigin: getEnvVar('CORS_ORIGIN', isProduction, 'http://localhost:3000')!
    .split(',')
    .map((origin) => origin.trim()),

  clientUrl: getEnvVar('CLIENT_URL', isProduction, 'http://localhost:3000')!,

  mongo: {
    uriTemplate: getEnvVar('DATABASE_URL', true)!,
    password: getEnvVar('DATABASE_PASSWORD', true)!,
  },

  jwt: {
    secret: getEnvVar('JWT_SECRET', true)!,
    expiresIn: getEnvVar('JWT_EXPIRES_IN', true, '90d')!,
  },

  emailFrom: getEnvVar('EMAIL_FROM', true)!,

  cloudinary: {
    cloudName: getEnvVar('CLOUDINARY_CLOUD_NAME', false),
    apiKey: getEnvVar('CLOUDINARY_API_KEY', false),
    apiSecret: getEnvVar('CLOUDINARY_API_SECRET', false),
  },

  mailtrap: {
    host: getEnvVar('MAILTRAP_HOST', false),
    port: getEnvVarAsInt('MAILTRAP_PORT', false),
    username: getEnvVar('MAILTRAP_USERNAME', false),
    password: getEnvVar('MAILTRAP_PASSWORD', false),
  },

  brevo: {
    host: getEnvVar('BREVO_HOST', false),
    port: getEnvVarAsInt('BREVO_PORT', false),
    user: getEnvVar('BREVO_USER', false),
    smtpKey: getEnvVar('BREVO_SMTP_KEY', false),
  },

  smtp: {
    host: getEnvVar('EMAIL_HOST', false, 'smtp.gmail.com'),
    port: getEnvVarAsInt('EMAIL_PORT', false, 587),
    user: getEnvVar('EMAIL_HOST_USER', false),
    password: getEnvVar('EMAIL_HOST_PASSWORD', false),
  },

  googleOAuth: {
    clientId: getEnvVar('GOOGLE_CLIENT_ID', false),
    clientSecret: getEnvVar('GOOGLE_CLIENT_SECRET', false),
    redirectUri: getEnvVar('GOOGLE_REDIRECT_URI', false, 'postmessage'),
  },

  gemini: {
    apiKey: getEnvVar('GOOGLE_AI_API_KEY', false),
    model: getEnvVar('GEMINI_MODEL', false, 'gemini-2.5-flash'),
    temperature: getEnvVarAsFloat('OPTIMIZATION_TEMPERATURE', false, 0.7),
    maxTokens: getEnvVarAsInt('OPTIMIZATION_MAX_TOKENS', false, 4000),
  },

  groq: {
    apiKey: getEnvVar('GROQ_API_KEY', false),
    model: getEnvVar('GROQ_MODEL', false, 'llama-3.3-70b-versatile'),
  },

  anthropic: {
    apiKey: getEnvVar('ANTHROPIC_API_KEY', false),
    // Cheap, fast default for benchmark runs; override per deployment.
    model: getEnvVar('ANTHROPIC_MODEL', false, 'claude-haiku-5-5'),
  },

  // "provider:model" used to score benchmark outputs. Must differ from the
  // evaluated models; the evaluation service falls back to another provider.
  judgeModel: getEnvVar('JUDGE_MODEL', false, 'google:gemini-2.5-flash')!,

  aiProvider: getEnvVar('AI_PROVIDER', false, 'auto')!,

  // Billing (Lemon Squeezy, merchant of record). All optional: billing
  // routes answer 503 until the key, store, webhook secret and a variant exist.
  // Use test-mode keys and variants outside production.
  lemonSqueezy: {
    apiKey: getEnvVar('LEMONSQUEEZY_API_KEY', false),
    storeId: getEnvVar('LEMONSQUEEZY_STORE_ID', false),
    webhookSecret: getEnvVar('LEMONSQUEEZY_WEBHOOK_SECRET', false),
    proMonthlyVariantId: getEnvVar('LEMONSQUEEZY_PRO_MONTHLY_VARIANT_ID', false),
    proYearlyVariantId: getEnvVar('LEMONSQUEEZY_PRO_YEARLY_VARIANT_ID', false),
    apiUrl: getEnvVar('LEMONSQUEEZY_API_URL', false, 'https://api.lemonsqueezy.com/v1')!,
  },

  // Product analytics (server-side events such as checkout_completed_pro).
  // Optional; nothing is sent when the key is unset. Use the same project as
  // the frontend's VITE_POSTHOG_KEY.
  posthog: {
    apiKey: getEnvVar('POSTHOG_API_KEY', false),
    host: getEnvVar('POSTHOG_HOST', false, 'https://us.i.posthog.com')!,
  },

  trustProxyHops: getEnvVarAsInt('TRUST_PROXY_HOPS', false, 1)!,

  // Requests per window. Windows: global 15 min, auth 15 min, AI 1 hour.
  rateLimit: {
    globalMax: getEnvVarAsInt('RATE_LIMIT_GLOBAL_MAX', false, 300)!,
    authMax: getEnvVarAsInt('RATE_LIMIT_AUTH_MAX', false, 10)!,
    aiMax: getEnvVarAsInt('RATE_LIMIT_AI_MAX', false, 30)!,
  },

  // 'lax' requires the frontend to reach the API same-site (Vercel /api proxy).
  // Use 'none' only while the frontend still calls the Render domain directly.
  cookieSameSite: getEnvVar('COOKIE_SAMESITE', false, 'lax') as AppConfig['cookieSameSite'],

  superAdmin: {
    email: getEnvVar('SUPER_ADMIN_EMAIL', false),
    password: getEnvVar('SUPER_ADMIN_PASSWORD', false),
    phone: getEnvVar('SUPER_ADMIN_PHONE', false),
  },
};

export default isProduction ? Object.freeze(config) : config;
