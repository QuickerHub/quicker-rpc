import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { isAbsolute, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const fixtureBase = fileURLToPath(new URL("../../../../../.tmp/", import.meta.url));
const agentGuiRoot = fileURLToPath(new URL("../../", import.meta.url));
const leaseModule = fileURLToPath(new URL("./writer-lease.ts", import.meta.url));

const actorSource = `
const {acquireAgentDatabaseWriterLease}=require(process.argv[1]);
let lease;
let input='';
const send=(value)=>process.stdout.write(JSON.stringify(value)+'\\n');
process.stdin.setEncoding('utf8');
process.stdin.on('data',(chunk)=>{
  input+=chunk;
  for(let index; (index=input.indexOf('\\n'))>=0;) {
    const command=input.slice(0,index); input=input.slice(index+1);
    try {
      if(command==='acquire') { lease=acquireAgentDatabaseWriterLease(process.argv[2]); send({event:'acquired',path:lease.databasePath}); }
      else if(command==='release') { lease.release(); lease=undefined; send({event:'released'}); }
      else if(command==='exit') { lease?.release(); process.exit(0); }
      else throw new Error('Unexpected fixture command');
    } catch(error) { send({event:'error',code:error.code,message:error.message}); }
  }
});
send({event:'ready'});
`;

type ActorMessage = { event: string; code?: string; path?: string; message?: string };

function actor(root: string, databasePath: string) {
  const env: NodeJS.ProcessEnv = {
    HOME: root, USERPROFILE: root, APPDATA: root, LOCALAPPDATA: root, TEMP: root, TMP: root,
    TSX_DISABLE_CACHE: "1",
  };
  for (const key of ["SystemRoot", "SystemDrive", "ComSpec", "PATH", "PATHEXT"]) if (process.env[key]) env[key] = process.env[key];
  const child = spawn(process.execPath, ["--import", "tsx", "--eval", actorSource, leaseModule, databasePath], {
    cwd: agentGuiRoot, env, windowsHide: true, stdio: ["pipe", "pipe", "pipe"],
  });
  let buffer = "";
  let errors = "";
  const messages: ActorMessage[] = [];
  let waiting: ((message: ActorMessage) => void) | undefined;
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    buffer += chunk;
    for (let index; (index = buffer.indexOf("\n")) >= 0;) {
      const message = JSON.parse(buffer.slice(0, index)) as ActorMessage;
      buffer = buffer.slice(index + 1);
      if (waiting) { const done = waiting; waiting = undefined; done(message); }
      else messages.push(message);
    }
  });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => { errors += chunk; });
  const exited = new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", () => resolve());
  });
  return {
    child, exited,
    next() {
      return new Promise<ActorMessage>((resolve, reject) => {
        if (messages.length) return resolve(messages.shift()!);
        const timer = setTimeout(() => reject(new Error(`Owned lease fixture did not reply: ${errors}`)), 5000);
        waiting = (message) => { clearTimeout(timer); resolve(message); };
      });
    },
    command(command: string) { child.stdin.write(`${command}\n`); return this.next(); },
  };
}

// This standalone fixture intentionally owns two real Node processes, never a user service.
test("SQLite writer lease excludes another process and OS releases it after the holder is killed", { timeout: 20_000 }, async () => {
  mkdirSync(fixtureBase, { recursive: true });
  const root = mkdtempSync(join(fixtureBase, "writer-lease-process-"));
  const databasePath = join(root, "agent.db");
  const actors: ReturnType<typeof actor>[] = [];
  try {
    const first = actor(root, databasePath);
    actors.push(first);
    const second = actor(root, databasePath);
    actors.push(second);
    assert.equal((await first.next()).event, "ready");
    assert.equal((await second.next()).event, "ready");
    assert.equal((await first.command("acquire")).event, "acquired");
    const conflict = await second.command("acquire");
    assert.equal(conflict.event, "error");
    assert.equal(conflict.code, "AGENT_DATABASE_WRITER_BUSY");
    first.child.kill("SIGKILL");
    await first.exited;
    assert.equal((await second.command("acquire")).event, "acquired");
    assert.equal((await second.command("release")).event, "released");
    assert.equal((await second.command("acquire")).event, "acquired");
    second.child.stdin.write("exit\n");
    await second.exited;
    assert.equal(second.child.exitCode, 0);
  } finally {
    for (const owned of actors) {
      if (owned.child.exitCode == null && owned.child.signalCode == null) owned.child.kill("SIGKILL");
      await owned.exited;
    }
    const suffix = relative(realpathSync(fixtureBase), realpathSync(root));
    assert.ok(suffix && suffix !== ".." && !suffix.startsWith(`..${sep}`) && !isAbsolute(suffix));
    rmSync(root, { recursive: true, force: true });
  }
});
