const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");
const PORT = Number(process.env.PORT || 3000);
const server = http.createServer((req,res)=>{
  const file = path.join(__dirname, "public", req.url === "/" ? "index.html" : decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, ""));
  if (!file.startsWith(path.join(__dirname,"public"))) { res.writeHead(403); return res.end("Forbidden"); }
  fs.readFile(file,(err,data)=>{ if(err){res.writeHead(404);return res.end("Not found");}
    res.writeHead(200,{"Content-Type":file.endsWith(".html")?"text/html; charset=utf-8":"application/octet-stream","Cache-Control":"no-store"});res.end(data);});
});
const wss = new WebSocket.Server({server});
const rooms = new Map();
const dirs=[[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
function initial(){const b=Array.from({length:8},()=>Array(8).fill(0));b[3][3]=2;b[3][4]=1;b[4][3]=1;b[4][4]=2;return {board:b,turn:1,passes:0,gameOver:false,lastMove:null}}
function flips(b,r,c,color){if(r<0||r>7||c<0||c>7||b[r][c]!==0)return [];let all=[];for(const [dr,dc] of dirs){let rr=r+dr,cc=c+dc,line=[];while(rr>=0&&rr<8&&cc>=0&&cc<8&&b[rr][cc]===3-color){line.push([rr,cc]);rr+=dr;cc+=dc}if(line.length&&rr>=0&&rr<8&&cc>=0&&cc<8&&b[rr][cc]===color)all.push(...line)}return all}
function moves(g,color){let a=[];for(let r=0;r<8;r++)for(let c=0;c<8;c++)if(flips(g.state.board,r,c,color).length)a.push([r,c]);return a}
function broadcast(g,obj){const s=JSON.stringify(obj);for(const p of g.players)if(p&&p.ws.readyState===WebSocket.OPEN)p.ws.send(s)}
function sync(g){broadcast(g,{type:"state",state:g.state,room:g.name,players:g.players.filter(Boolean).length})}
function error(ws,message){if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type:"error",message}))}
wss.on("connection",ws=>{
 ws.on("message",raw=>{let m;try{m=JSON.parse(raw.toString())}catch{return}
  if(m.type==="create"||m.type==="join"){
   const name=String(m.room||"").trim(),pass=String(m.password||"");
   if(!name||!pass)return error(ws,"ルーム名とパスワードが必要です。");
   let g=rooms.get(name);
   if(m.type==="create"){
    if(g)return error(ws,"そのルームは既にあります。参加するか別のルーム名を使ってください。");
    g={name,password:pass,players:[],state:initial()};rooms.set(name,g);
   } else if(!g)return error(ws,"ルームがありません。作成者にルーム名を確認してください。");
   if(g.password!==pass)return error(ws,"ルームパスワードが違います。");
   if(g.players.length>=2)return error(ws,"ルームは満員です（2人まで）。");
   const color=g.players.length===0?1:2;const player={ws,color,name:String(m.name||"プレイヤー").slice(0,18),room:name};g.players.push(player);ws.player=player;ws.game=g;
   ws.send(JSON.stringify({type:"joined",color,room:name,players:g.players.length}));sync(g);return;
  }
  const p=ws.player,g=ws.game;if(!p||!g)return error(ws,"先にルームへ参加してください。");
  if(m.type==="move"){
   if(g.state.gameOver||g.state.turn!==p.color)return;
   const r=Number(m.r),c=Number(m.c);if(!Number.isInteger(r)||!Number.isInteger(c)||r<0||r>7||c<0||c>7)return;
   const f=flips(g.state.board,r,c,p.color);if(!f.length)return;
   g.state.board[r][c]=p.color;for(const [rr,cc] of f)g.state.board[rr][cc]=p.color;
   g.state.turn=3-p.color;g.state.passes=0;g.state.lastMove=[r,c];
   if(!moves(g,g.state.turn).length){if(!moves(g,p.color).length)g.state.gameOver=true;else g.state.passes=1;}
   sync(g);
  } else if(m.type==="pass"){
   if(g.state.gameOver||g.state.turn!==p.color||moves(g,p.color).length)return;
   if(g.state.passes===1)g.state.gameOver=true;else{g.state.passes=1;g.state.turn=3-p.color;}
   sync(g);
  } else if(m.type==="reset"){
   if(p.color!==1)return;g.state=initial();sync(g);
  }
 });
 ws.on("close",()=>{const p=ws.player,g=ws.game;if(!p||!g)return;g.players=g.players.filter(x=>x!==p);broadcast(g,{type:"opponentLeft"});if(g.players.length===0)rooms.delete(g.name);});
});
server.listen(PORT,"0.0.0.0",()=>console.log(`Othello Wi-Fi server running on http://0.0.0.0:${PORT}`));
