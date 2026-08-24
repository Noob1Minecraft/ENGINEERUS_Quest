import assert from 'node:assert/strict';
import test from 'node:test';
import express, { type RequestHandler } from 'express';
import type { DirectChatRepository, DirectMessage } from '../server/persistence/directChats';
import { createDirectChatsRouter } from '../server/routes/directChats';
import { withServer } from './helpers';

const USER='96000000-0000-4000-8000-000000000001', TARGET='96000000-0000-4000-8000-000000000002';
const CONVERSATION='96100000-0000-4000-8000-000000000001', MESSAGE='96200000-0000-4000-8000-000000000001';
const NOW='2026-08-24T08:00:00.000Z';
const message: DirectMessage={ id:MESSAGE,conversation_id:CONVERSATION,sender_id:USER,client_message_id:'96300000-0000-4000-8000-000000000001',content:'Hello',created_at:NOW,edited_at:null };

function repository(overrides: Partial<DirectChatRepository>={}): DirectChatRepository { return {
  getOrCreate:async()=>({conversation_id:CONVERSATION}), list:async()=>({conversations:[],next_cursor:null}),
  listMessages:async()=>({messages:[message],next_cursor:null}), send:async()=>message,
  markRead:async()=>({read_at:NOW}), block:async()=>{}, unblock:async()=>{}, ...overrides,
}; }
function appFor(repo:DirectChatRepository){ const app=express(); app.use(express.json());
  const auth:RequestHandler=(_q,r,n)=>{r.locals.auth={userId:USER,accessToken:'safe-token',claims:{}};n();};
  app.use(createDirectChatsRouter(auth,(_q,_r,n)=>n(),(_q,_r,n)=>n(),(_q,_r,n)=>n(),repo)); return app; }

test('conversation creation forwards only verified token and target relationship inputs', async()=>{
  let call:unknown; const repo=repository({getOrCreate:async(token,target,project)=>{call={token,target,project};return {conversation_id:CONVERSATION};}});
  await withServer(appFor(repo),async base=>{const response=await fetch(`${base}/api/direct-conversations`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({target_profile_id:TARGET,project_id:null})});assert.equal(response.status,201);});
  assert.deepEqual(call,{token:'safe-token',target:TARGET,project:null});
});

test('client cannot supply sender, members, timestamps, or arbitrary conversation identity',async()=>{
  await withServer(appFor(repository()),async base=>{
    for(const body of [{target_profile_id:TARGET,sender_id:USER},{target_profile_id:TARGET,members:[USER,TARGET]},{target_profile_id:TARGET,id:CONVERSATION}]){
      const response=await fetch(`${base}/api/direct-conversations`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});assert.equal(response.status,400);
    }
  });
});

test('send uses bounded content, client idempotency UUID, and no sender field',async()=>{
  let call:unknown; const repo=repository({send:async(token,conversation,id,content)=>{call={token,conversation,id,content};return message;}});
  await withServer(appFor(repo),async base=>{const response=await fetch(`${base}/api/direct-conversations/${CONVERSATION}/messages`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_message_id:message.client_message_id,content:' Hello '})});assert.equal(response.status,201);});
  assert.deepEqual(call,{token:'safe-token',conversation:CONVERSATION,id:message.client_message_id,content:'Hello'});
});

test('conversation and message pagination cursors round-trip without total account counts',async()=>{
  await withServer(appFor(repository()),async base=>{
    const conversations=await fetch(`${base}/api/direct-conversations?limit=25`);assert.equal(conversations.status,200);assert.doesNotMatch(JSON.stringify(await conversations.json()),/total_count|email|telegram|oauth/i);
    const messages=await fetch(`${base}/api/direct-conversations/${CONVERSATION}/messages?limit=50`);assert.equal(messages.status,200);assert.equal((await messages.json() as {messages:unknown[]}).messages.length,1);
  });
});

test('mark-read and blocking actions use path identity and authenticated token',async()=>{
  const calls:unknown[]=[]; const repo=repository({markRead:async(t,c)=>{calls.push(['read',t,c]);return {read_at:NOW};},block:async(t,p)=>{calls.push(['block',t,p]);},unblock:async(t,p)=>{calls.push(['unblock',t,p]);}});
  await withServer(appFor(repo),async base=>{assert.equal((await fetch(`${base}/api/direct-conversations/${CONVERSATION}/read`,{method:'POST'})).status,200);assert.equal((await fetch(`${base}/api/direct-chat/blocks/${TARGET}`,{method:'POST'})).status,204);assert.equal((await fetch(`${base}/api/direct-chat/blocks/${TARGET}`,{method:'DELETE'})).status,204);});
  assert.deepEqual(calls,[['read','safe-token',CONVERSATION],['block','safe-token',TARGET],['unblock','safe-token',TARGET]]);
});

test('invalid UUIDs, cursors, and oversized messages fail closed',async()=>{
  await withServer(appFor(repository()),async base=>{
    assert.equal((await fetch(`${base}/api/direct-conversations/not-a-uuid/messages`)).status,400);
    assert.equal((await fetch(`${base}/api/direct-conversations?cursor=bad`)).status,400);
    assert.equal((await fetch(`${base}/api/direct-conversations/${CONVERSATION}/messages`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_message_id:message.client_message_id,content:'x'.repeat(4001)})})).status,400);
  });
});
