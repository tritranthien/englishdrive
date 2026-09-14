import { parseEnvironment } from './env.js';

describe('parseEnvironment', () => {
  it('applies development defaults', () => {
    expect(
      parseEnvironment({
        DATABASE_URL: 'postgresql://user:password@localhost:5432/database',
        JWT_SECRET: 'a-development-secret-with-at-least-32-characters',
      }),
    ).toMatchObject({ NODE_ENV: 'development', PORT: 3000 });
  });

  it('rejects an invalid database URL', () => {
    expect(() =>
      parseEnvironment({
        DATABASE_URL: 'not-a-url',
        JWT_SECRET: 'a-development-secret-with-at-least-32-characters',
      }),
    ).toThrow('Invalid environment variables');
  });

  it('treats blank optional provider keys as unconfigured', () => {
    expect(
      parseEnvironment({
        DATABASE_URL: 'postgresql://user:password@localhost:5432/database',
        JWT_SECRET: 'a-development-secret-with-at-least-32-characters',
        GEMINI_API_KEY: '',
        OPENAI_API_KEY: '',
      }),
    ).toMatchObject({
      LIVE_PROVIDER: 'gemini',
      GEMINI_API_KEY: undefined,
      OPENAI_API_KEY: undefined,
    });
  });

  it('rejects a weak JWT secret', () => {
    expect(() =>
      parseEnvironment({
        DATABASE_URL: 'postgresql://user:password@localhost:5432/database',
        JWT_SECRET: 'too-short',
      }),
    ).toThrow('Invalid environment variables');
  });
});
