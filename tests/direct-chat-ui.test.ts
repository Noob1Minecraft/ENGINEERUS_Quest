import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  blockDirectChatUser, createDirectConversation, listDirectConversations, listDirectMessages,
  markDirectConversationRead, sendDirectMessage, unblockDirectChatUser, type DirectChatFetcher,
} from '../src/directChat/directChatApi';

const CONVERSATION='97100000-0000-4000-8000-000000000001', PROFILE='97000000-0000-4000-8000-000000000002';
test('direct chat helpers use only the dedicated REST surface',async()=>{
  const calls:Array<{endpoint:string;method?:string;body?:string}>=[];
  const fetcher:DirectChatFetcher=async<T>(endpoint,options)=>{calls.push({endpoint,method:options?.method,body:options?.body as string|undefined});return ({conversation_id:CONVERSATION,conversations:[],messages:[],next_cursor:null,message:{},read_at:''}) as T;};
  await createDirectConversation(PROFILE,null,fetcher); await listDirectConversations(null,fetcher);
  await listDirectMessages(CONVERSATION,null,fetcher); await sendDirectMessage(CONVERSATION,'hello','97200000-0000-4000-8000-000000000001',fetcher);
  await markDirectConversationRead(CONVERSATION,fetcher); await blockDirectChatUser(PROFILE,fetcher); await unblockDirectChatUser(PROFILE,fetcher);
  assert.deepEqual(calls.map(({endpoint,method})=>[method??'GET',endpoint]),[
    ['POST','/api/direct-conversations'],['GET','/api/direct-conversations?limit=25'],
    ['GET',`/api/direct-conversations/${CONVERSATION}/messages?limit=50`],['POST',`/api/direct-conversations/${CONVERSATION}/messages`],
    ['POST',`/api/direct-conversations/${CONVERSATION}/read`],['POST',`/api/direct-chat/blocks/${PROFILE}`],['DELETE',`/api/direct-chat/blocks/${PROFILE}`],
  ]);
  assert.doesNotMatch(JSON.stringify(calls),/sender_id|email|telegram|oauth/i);
});

test('Messages UI is distinct from AI chat and polls only while visible',()=>{
  const source=readFileSync(path.resolve('src/components/DirectChatTab.tsx'),'utf8');
  assert.match(source,/document\.visibilityState !== 'visible'/);
  assert.match(source,/setInterval\(poll, 5000\)/);
  assert.match(source,/new Map/);
  assert.match(source,/markDirectConversationRead/);
  assert.doesNotMatch(source,/AIAssistantTab|chat_sessions|chat_messages|Groq/i);
});

test('Messages navigation and eligible recruitment actions are present without public-profile messaging',()=>{
  const app=readFileSync(path.resolve('src/App.tsx'),'utf8');
  const header=readFileSync(path.resolve('src/components/Header.tsx'),'utf8');
  const bottom=readFileSync(path.resolve('src/components/BottomNav.tsx'),'utf8');
  const recruitment=readFileSync(path.resolve('src/components/ProjectRecruitmentPanel.tsx'),'utf8');
  const profile=readFileSync(path.resolve('src/components/ProfileTab.tsx'),'utf8');
  assert.match(app,/DirectChatTab/); assert.match(header,/messages/); assert.match(bottom,/messages/);
  assert.match(recruitment,/application\.status === 'accepted'/); assert.match(recruitment,/invitation\.status === 'accepted'/);
  assert.doesNotMatch(profile,/createDirectConversation|direct-chat/i);
});

test('Direct Chat uses separate bounded create, write, and polling rate limits',()=>{
  const source=readFileSync(path.resolve('server/middleware/authenticatedRateLimit.ts'),'utf8');
  assert.match(source,/createDirectChatCreateRateLimit[\s\S]*limit: 10/);
  assert.match(source,/createDirectChatWriteRateLimit[\s\S]*limit: 90/);
  assert.match(source,/createDirectChatReadRateLimit[\s\S]*limit: 300/);
});
