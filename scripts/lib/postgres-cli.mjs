import { spawn } from 'node:child_process';

export function postgresEnvironment(databaseUrl, baseEnvironment = process.env) {
  const parsed = new URL(databaseUrl);
  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    throw new Error('DATABASE_URL must use the postgres:// or postgresql:// scheme.');
  }
  if (!parsed.hostname || !parsed.pathname.slice(1)) {
    throw new Error('DATABASE_URL must include a hostname and database name.');
  }

  const environment = { ...baseEnvironment };
  delete environment.DATABASE_URL;
  environment.PGHOST = parsed.hostname;
  environment.PGPORT = parsed.port || '5432';
  environment.PGDATABASE = decodeURIComponent(parsed.pathname.slice(1));
  if (parsed.username) environment.PGUSER = decodeURIComponent(parsed.username);
  if (parsed.password) environment.PGPASSWORD = decodeURIComponent(parsed.password);
  const sslMode = parsed.searchParams.get('sslmode');
  if (sslMode) environment.PGSSLMODE = sslMode;
  return environment;
}

export function runPostgresCommand(command, args, environment) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: environment,
      shell: false,
      stdio: 'inherit',
      windowsHide: true,
    });
    child.once('error', (error) => {
      reject(
        error.code === 'ENOENT'
          ? new Error(`${command} was not found. Install PostgreSQL client tools and put them on PATH.`)
          : error,
      );
    });
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} failed${signal ? ` with signal ${signal}` : ` with exit code ${code}`}.`));
    });
  });
}
