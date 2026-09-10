import {readFileSync} from 'node:fs';
import * as sdk from 'firebase/firestore';
const source=readFileSync(new URL('../../js/transacao-estoque.js',import.meta.url),'utf8').replace(/^import .*;\n/m,'').replace(/export /g,'');
export const wrapInventoryTransaction=new Function('nativeTransaction','doc','serverTimestamp',source+'; return wrapInventoryTransaction;')(sdk.runTransaction,sdk.doc,sdk.serverTimestamp);
