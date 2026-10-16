interface MongoConfig {
  uriTemplate: string;
  password: string;
}

interface JwtConfig {
  secret: string;
  expiresIn: string;
}

interface CloudinaryConfig {
  cloudName?: string;
  apiKey?: string;
  apiSecret?: string;
}

interface MailtrapConfig {
  host?: string;
  port?: number;
  username?: string;
  password?: string;
}

interface BrevoConfig {
  host?: string;
  port?: number;
  user?: string;
  smtpKey?: string;
}

interface SmtpConfig {
  host?: string;
  port?: number;
  user?: string;
  password?: string;
}

interface SuperAdminConfig {
  email?: string;
  password?: string;
  phone?: string;
}

interface GoogleOAuthConfig {
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
}

interface GeminiConfig {
  apiKey?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

interface AnthropicConfig {
  apiKey?: string;
  model?: string;
}

interface GroqConfig {
  apiKey?: string;
  model?: string;
}

interface RateLimitConfig {
  globalMax: number;
  authMax: number;
  aiMax: number;
}

export interface AppConfig {
  nodeEnv: 'development' | 'production' | 'test';
  isProduction: boolean;
  port: number;

  logLevel: 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'trace';

  corsOrigin: string[];
  clientUrl: string;
  mongo: MongoConfig;
  jwt: JwtConfig;
  emailFrom: string;
  cloudinary: CloudinaryConfig;
  mailtrap: MailtrapConfig;
  brevo: BrevoConfig;
  smtp: SmtpConfig;
  googleOAuth: GoogleOAuthConfig;
  gemini: GeminiConfig;
  groq: GroqConfig;
  anthropic: AnthropicConfig;
  judgeModel: string;
  trustProxyHops: number;
  rateLimit: RateLimitConfig;
  cookieSameSite: 'lax' | 'strict' | 'none';
  aiProvider: string;
  superAdmin: SuperAdminConfig;
}
