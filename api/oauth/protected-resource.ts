import { getProtectedResourceMetadata } from '../../src/services/chatgptApp/oauthServer.js';
import { sendJson, type VercelRequest, type VercelResponse } from './_response.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method && req.method.toUpperCase() !== 'GET') {
    res.setHeader('Allow', 'GET');
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }

  sendJson(res, 200, getProtectedResourceMetadata(req.headers), {
    'Access-Control-Allow-Origin': '*',
  });
}
