import { neon } from "@neondatabase/serverless";
import { list } from "@vercel/blob";

const present = name => Boolean(process.env[name]);
console.log("RECONCILIATION_ACCESS_CHECK",JSON.stringify({
  environment:process.env.VERCEL_ENV??"unset",
  database:present("DATABASE_URL"),
  blobStore:present("BLOB_STORE_ID"),
  blobToken:present("BLOB_READ_WRITE_TOKEN"),
  oidc:present("VERCEL_OIDC_TOKEN")
}));
if(process.env.VERCEL_ENV==="production"){
  if(process.env.DATABASE_URL){
    try {
      const sql=neon(process.env.DATABASE_URL);
      const r=await sql`SELECT COUNT(*)::int AS n FROM imports WHERE storage_key LIKE 'funds/%'`;
      console.log("RECONCILIATION_DB_FILES",r[0]?.n??"n/a");
    }catch(error){console.log("RECONCILIATION_DB_ERROR",String(error?.message||error).slice(0,110))}
  }
  if(process.env.BLOB_STORE_ID||process.env.BLOB_READ_WRITE_TOKEN){
    try {
      const r=await list({limit:1});
      console.log("RECONCILIATION_BLOB_ACCESS",Array.isArray(r.blobs)?"ok":"unavailable");
    }catch(error){console.log("RECONCILIATION_BLOB_ERROR",String(error?.message||error).slice(0,130))}
  }
}
