import 'dotenv/config';
import dotenv from 'dotenv';
import { cert, getApp, getApps, initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

dotenv.config({ path: '.env.local', override: true });
dotenv.config({ path: '.env', override: false });

const DEFAULT_PROJECT_ID = 'demo-replofy-os';
const DEFAULT_DATABASE_ID = '(default)';

function getProjectId() {
  return process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || DEFAULT_PROJECT_ID;
}
function getDatabaseId() {
  return process.env.FIREBASE_DATABASE_ID || process.env.FIRESTORE_DATABASE_ID || DEFAULT_DATABASE_ID;
}
function credential() {
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (json) return cert(JSON.parse(json));
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || getProjectId();
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL?.trim();
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (projectId && clientEmail && privateKey) return cert({ projectId, clientEmail, privateKey });
  return applicationDefault();
}

const app = getApps().length ? getApp() : initializeApp({ projectId: getProjectId(), credential: credential() });
const db = getFirestore(app, getDatabaseId());

const pairs = [
  ['0L9hLZ1c2lZCQQlmnm2h', '5b57da54478c8c44f2153f44803f1fc0'],
  ['Hco9ZjVXXyLakii2HjXM', '2945f1b690117926f131bb8ff01085b4'],
  ['r5Ecw5bU8Q2qLNXT6lPV', '8af6f3a2a309eb080e9f206a419e57aa'],
];

for (const [creativeId, assetId] of pairs) {
  const creativeSnap = await db.collection('creativeItems').doc(creativeId).get();
  const assetSnap = await db.collection('creativeAssets').doc(assetId).get();
  const creative = creativeSnap.exists ? creativeSnap.data() : null;
  const asset = assetSnap.exists ? assetSnap.data() : null;
  console.log(JSON.stringify({
    creativeId,
    creativeExists: creativeSnap.exists,
    title: creative?.title ?? null,
    status: creative?.status ?? null,
    assetIds: creative?.assetIds ?? null,
    hasExpectedAssetId: Array.isArray(creative?.assetIds) && creative.assetIds.includes(assetId),
    assetId,
    assetExists: assetSnap.exists,
    assetStatus: asset?.status ?? null,
    assetCreativeId: asset?.creativeId ?? null,
    assetMatchesCreative: asset?.creativeId === creativeId,
    fileName: asset?.fileName ?? null,
    storagePath: asset?.storagePath ?? null,
    url: asset?.secureUrl ?? asset?.url ?? asset?.downloadUrl ?? asset?.cloudinarySecureUrl ?? null,
  }));
}
