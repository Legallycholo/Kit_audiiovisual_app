import { z } from "zod";
import { HttpError } from "./database";
/** Shared stateless transport. Model output is data, never executable authority. */
export async function structuredResponse(options:{key:string;model:string;name:string;schema:z.ZodType;instructions:string;input:unknown;signal?:AbortSignal;transport?:typeof fetch}):Promise<unknown>{
  let response:Response;
  try{response=await (options.transport||fetch)("https://api.openai.com/v1/responses",{
    method:"POST",redirect:"error",headers:{Authorization:`Bearer ${options.key}`,"Content-Type":"application/json"},
    signal:options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(60_000)]):AbortSignal.timeout(60_000),
    body:JSON.stringify({model:options.model,store:false,max_output_tokens:6000,instructions:options.instructions,input:JSON.stringify(options.input),text:{format:{type:"json_schema",name:options.name,strict:true,schema:z.toJSONSchema(options.schema,{target:"draft-7"})}}}),
  });}catch{throw new HttpError(503,"No se pudo contactar la IA. Puedes reintentar; no se aplicó ninguna acción.");}
  if(!response.ok)throw new HttpError(response.status===429?429:502,response.status===429?"La IA alcanzó su límite de uso. Intenta más tarde.":"La IA no pudo generar la respuesta. Revisa la conexión del servidor.");
  if(!response.body)throw new HttpError(502,"Respuesta de IA vacía.");
  const reader=response.body.getReader();const parts:Uint8Array[]=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2_000_000)throw new HttpError(502,"Respuesta de IA demasiado grande.");parts.push(value);}}finally{await reader.cancel();reader.releaseLock();}
  let value:any;try{value=JSON.parse(Buffer.concat(parts).toString());}catch{throw new HttpError(502,"Respuesta de IA inválida.");}
  if(value.status!=="completed"||!Array.isArray(value.output))throw new HttpError(502,"La respuesta de IA quedó incompleta.");
  const content=value.output.filter((i:any)=>i.type==="message").flatMap((i:any)=>Array.isArray(i.content)?i.content:[]);
  if(content.some((i:any)=>i.type==="refusal"))throw new HttpError(422,"La IA no pudo responder a esta solicitud.");
  try{return JSON.parse(content.filter((i:any)=>i.type==="output_text").map((i:any)=>i.text||"").join(""));}catch{throw new HttpError(502,"La IA no devolvió una respuesta válida.");}
}
