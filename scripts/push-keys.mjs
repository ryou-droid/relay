// Operator-only local command. Never invoke on the server or commit its output.
import webpush from 'web-push';
import { randomBytes } from 'node:crypto';
const keys = webpush.generateVAPIDKeys();
console.log(JSON.stringify({
 NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY: keys.publicKey,
 WEB_PUSH_PRIVATE_KEY: keys.privateKey,
 PUSH_DISPATCH_TOKEN: randomBytes(32).toString('base64url'),
},null,2));
