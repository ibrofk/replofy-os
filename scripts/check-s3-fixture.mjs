import 'dotenv/config';
import { createS3Client, s3OptionsFromEnvironment } from './lib/s3-client.mjs';

const client = createS3Client(s3OptionsFromEnvironment());
const key = process.env.REPLOFY_S3_FIXTURE_KEY || 'ci-workspace/release-marker.txt';
const expected = process.env.REPLOFY_S3_FIXTURE_CONTENT || 's3-combined-backup-proof\n';
const object = await client.getObject(key);
if (!object) throw new Error(`S3 fixture is missing: ${key}`);
const chunks = [];
for await (const chunk of object.body) chunks.push(Buffer.from(chunk));
const actual = Buffer.concat(chunks).toString('utf8');
if (actual !== expected) throw new Error(`S3 fixture content mismatch for ${key}.`);
console.log(`[replofy-os] verified S3 fixture: ${key}`);
