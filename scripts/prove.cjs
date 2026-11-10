const fs=require('node:fs');
const path=require('node:path');
const {root,assert,equal,digest,sourceHash,invoke,read,rpc,receipt,receiptSummary,save}=require('./transport.cjs');
const {decodeReceipt}=require('./receipt-calldata.cjs');
const cases={
 transitive:{rows:[[2,3],[2,3],null],analysis:{status:'CONSISTENT',bounds:[[2,3],[2,3],[4,6]],eligible:[0,1,2],conflict:[]}},
 partial:{rows:[[1,3],[2,3],null],analysis:{status:'CONSISTENT',bounds:[[1,3],[2,3],[3,6]],eligible:[1,2],conflict:[]}},
 inconsistent:{rows:[[2,3],[2,3],[0,1]],analysis:{status:'INCONSISTENT',bounds:null,eligible:[],conflict:[0,1,2]}},
 unresolved:{rows:'UNRESOLVED',analysis:{status:'UNRESOLVED',bounds:null,eligible:[],conflict:[]}},
};
async function main(){
 const id=process.env.CLOCK_SCENARIO;
 assert(Object.hasOwn(cases,id),'Choose a supported report');
 const {rows,analysis}=cases[id],wallets=JSON.parse(process.env.SPLICE_ACCOUNTS||'[]');
 assert(wallets.length===3&&new Set(wallets.map(x=>x.address)).size===3,'Three distinct disposable signers required');
 const [issuer,recipient]=wallets.map(x=>x.address);
 const rev=fs.readFileSync(path.join(root,'fixture-revision.txt'),'utf8').trim();
 assert(/^[0-9a-f]{40}$/.test(rev),'Pinned report revision required');
 const url='https://raw.githubusercontent.com/gabrieladash123-bit/clock-mesh/'+rev+'/reports/'+id+'.txt';
 const raw=fs.readFileSync(path.join(root,'reports',id+'.txt')),sha256=digest(raw);
 const ctor=[url,sha256,recipient],code=fs.readFileSync(path.join(root,'contracts/clock_mesh.py'));
 assert(await rpc('eth_chainId',[])==='0xf22f','StudioNet only');
 process.env.SPLICE_ACCOUNT=wallets[0].name;
 const deployment=await invoke(id+'-deploy',['deploy','--contract','contracts/clock_mesh.py','--args',...ctor]);
 const deployed=await receipt(id+'-deploy',deployment,true),contract=deployed.to_address||deployed.recipient;
 assert(/^0x[0-9a-f]{40}$/i.test(contract),'Deployment address missing');
 const trace=[];
 async function verify(label,r,hash,signer,typed,error){
   const s=receiptSummary(r),votes=Object.values(r.consensus_data.votes);
   assert(s.hash===hash&&s.agree>votes.length/2&&s.status==='FINALIZED'&&s.result==='MAJORITY_AGREE','Finalized strict majority');
   assert((r.from_address||r.sender).toLowerCase()===signer&&(r.to_address||r.recipient).toLowerCase()===contract.toLowerCase(),'Signer and target');
   assert(equal(await decodeReceipt(r),typed),'Exact signed arguments');
   if(error){const msg=Buffer.from(r.consensus_data.leader_receipt[0].result,'base64');assert(msg[0]===1&&msg.subarray(1).toString()===error,'Expected revert: '+error);}
   trace.push({label,...s,signer,typed,error});
 }
 await verify('deploy',deployed,deployment,issuer,{args:ctor},null);
 assert(code.equals(Buffer.from(deployed.data.contract_code,'base64')),'Exact deployed bytes');
 const expected={config:{url,sha256,issuer,recipient},observation:null,analysis:null,holders:[issuer,issuer,issuer]};
 async function state(label){
   const observed=await read(id+'-'+label+'-state',['call',contract,'get_state']);
   assert(equal(observed,expected),'Unexpected full onchain state: '+label);
   trace.at(-1).state=observed;
   save(id+'-progress',{id,contract,deployment,source_sha256:sourceHash,revision:rev,trace});
 }
 await state('deploy');
 async function send(label,actor,method,args,error,update=()=>{}){
   process.env.SPLICE_ACCOUNT=wallets[actor].name;
   const hash=await invoke(id+'-'+label,['write',contract,method,...(args.length?['--args',...args.map(String)]:[])]);
   await verify(label,await receipt(id+'-'+label,hash,!error),hash,wallets[actor].address,{method,args},error);
   update();
   await state(label);
 }
 await send('premature',1,'claim',[0],'Window not proven');
 await send('resolve',2,'resolve',[],null,()=>{expected.observation={rows,report:raw.toString('utf8')};expected.analysis=analysis;});
 await send('outsider',2,'claim',[0],'Recipient only');
 for(let i=0;i<3;i++){
   const allowed=analysis.eligible.includes(i);
   await send('claim-'+i,1,'claim',[i],allowed?null:'Window not proven',()=>{if(allowed)expected.holders[i]=recipient;});
 }
 const first=analysis.eligible[0];
 if(first!==undefined)await send('replay-claim',1,'claim',[first],'Right already transferred');
 assert(code.equals(Buffer.from(await rpc('gen_getContractCode',[contract]),'base64')),'Fresh deployed code matches');
 save(id+'-verified',{id,contract,deployment,source_sha256:sourceHash,revision:rev,trace});
 console.log(JSON.stringify({id,contract,deployment,receipts:trace.length}));
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
