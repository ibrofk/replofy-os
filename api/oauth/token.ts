import { handleOAuthTokenRequest } from '../../src/services/chatgptApp/oauthServer.js';
import { parseBody, sendJson, sendOAuthError, type VercelRequest, type VercelResponse } from './_response.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method?.toUpperCase() !== 'POST') {
      res.setHeader('Allow', 'POST');
      sendJson(res, 405, { error: 'Method not allowed.' });
      return;
    }

    sendJson(res, 200, await handleOAuthTokenRequest(req.headers, parseBody(req)));
  } catch (error) {
    sendOAuthError(res, error);
  }
}
