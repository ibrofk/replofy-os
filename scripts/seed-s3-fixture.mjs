import 'dotenv/config';
import { Readable } from 'node:stream';
import { createS3Client, s3OptionsFromEnvironment } from './lib/s3-client.mjs';

const client = createS3Client(s3OptionsFromEnvironment());
await client.ensureBucket();
const key = process.env.REPLOFY_S3_FIXTURE_KEY || 'ci-workspace/release-marker.txt';
const content = process.env.REPLOFY_S3_FIXTURE_CONTENT || 's3-combined-backup-proof\n';
await client.putObject(key, Readable.from(content), 'text/plain');
console.log(`[replofy-os] seeded S3 fixture: ${key}`);
