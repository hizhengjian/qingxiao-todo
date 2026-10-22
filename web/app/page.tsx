import {requireChatGPTUser} from "./chatgpt-auth";
export const dynamic="force-dynamic";
export default async function Home(){await requireChatGPTUser("/");return <iframe title="轻效 Todo" src="/client.html" style={{position:"fixed",inset:0,border:0,width:"100%",height:"100%"}}/>;}
