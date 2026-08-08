import { sendJson, type VercelRequest, type VercelResponse } from './_response.js';

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  sendJson(res, 404, {
    error: 'not_found',
    error_description: 'This Replofy OS connector supports OAuth 2.1, not OpenID Connect.',
  });
}
