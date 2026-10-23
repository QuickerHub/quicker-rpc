import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import Database from "better-sqlite3";

const fixtureBase = fileURLToPath(new URL("../../../../../.tmp/", import.meta.url));
const agentGuiRoot = fileURLToPath(new URL("../../", import.meta.url));
const clientModule = fileURLToPath(new URL("./client.ts", import.meta.url));
const networkGuard = new URL("../../scripts/agent-offline-network-guard.mjs", import.meta.url).href;

const actorSource = `
const fs=require('node:fs');
const {resolve,sep}=require('node:path');
const {syncBuiltinESMExports}=require('node:module');
const ambientRoots=JSON.parse(process.argv[2]).map(root=>resolve(root).toLowerCase());
let ambientTouches=0;
for(const operation of ['existsSync','readFileSync','copyFileSync','cpSync','readdirSync','statSync']) {
  const original=fs[operation];
  fs[operation]=function(...args) {
    const paths=operation==='copyFileSync'||operation==='cpSync' ? args.slice(0,2) : args.slice(0,1);
    for(const candidate of paths) if(typeof candidate==='string') {
      const absolute=resolve(candidate).toLowerCase();
      if(ambientRoots.some(root=>absolute===root||absolute.startsWith(root+sep))) {
        ambientTouches++;
        throw new Error('Explicit profile attempted ambient fixture discovery');
      }
    }
    return Reflect.apply(original,this,args);
  };
}
syncBuiltinESMExports();
const client=require(process.argv[1]);
const send=value=>process.stdout.write(JSON.stringify({...value,ambientTouches})+'\\n');
let input='';
process.stdin.setEncoding('utf8');
process.stdin.on('data',chunk=>{
  input+=chunk;
  for(let index;(index=input.indexOf('\\n'))>=0;) {
    const command=input.slice(0,index); input=input.slice(index+1);
    try {
      if(command==='open') {
        client.getChatDatabase();
        const sqlite=client.getAgentSqlite();
        const hasAmbient=Boolean(sqlite.prepare("SELECT name FROM sqlite_master WHERE name='fixture_ambient_marker'").get());
        const hasCheckpoint=Boolean(sqlite.prepare("SELECT name FROM sqlite_master WHERE name='fixture_writer_checkpoint'").get());
        const checkpoint=hasCheckpoint?sqlite.prepare('SELECT value FROM fixture_writer_checkpoint').get()?.value:null;
        const secrets=sqlite.prepare("SELECT value_json FROM app_kv WHERE key='llm.secrets'").get()?.value_json??null;
        send({event:'opened',databasePath:sqlite.name,hasAmbient,checkpoint,secrets});
      } else if(command==='seed') {
        client.getAgentSqlite().exec("CREATE TABLE fixture_writer_checkpoint(value TEXT); INSERT INTO fixture_writer_checkpoint VALUES ('preserved-before-crash')");
        send({event:'seeded'});
      } else if(command==='exit') {
        client.closeAgentDatabase(); process.exit(0);
      } else throw new Error('Unexpected client fixture command');
    } catch(error) { send({event:'error',code:error.code,message:error.message}); }
  }
});
send({event:'ready'});
`;

type ActorMessage = {
  event: string;
  ambientTouches: number;
  code?: string;
  message?: string;
  databasePath?: string;
  hasAmbient?: boolean;
  checkpoint?: string | null;
  secrets?: string | null;
};

function actor(root: string, profile: string, ambientRoots: string[]) {
  const env: NodeJS.ProcessEnv = {
    QUICKER_AGENT_DATA_DIR: profile, AGENT_GUI_ROOT: join(root, "ambient-install"),
    HOME: join(root, "home"), USERPROFILE: join(root, "home"),
    APPDATA: join(root, "roaming"), LOCALAPPDATA: join(root, "local"),
    XDG_DATA_HOME: join(root, "xdg-data"), TEMP: root, TMP: root, TSX_DISABLE_CACHE: "1",
  };
  for (const key of ["SystemRoot", "SystemDrive", "ComSpec", "PATH", "PATHEXT"]) if (process.env[key]) env[key] = process.env[key];
  const child = spawn(process.execPath, ["--import", networkGuard, "--import", "tsx", "--eval", actorSource, clientModule, JSON.stringify(ambientRoots)], {
    cwd: agentGuiRoot, env, windowsHide: true, stdio: ["pipe", "pipe", "pipe"],
  });
  let buffer = "", errors = "";
  let ended = false;
  const messages: ActorMessage[] = [];
  let waiting: { resolve(message: ActorMessage): void; reject(error: Error): void } | undefined;
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    buffer += chunk;
    for (let index; (index = buffer.indexOf("\n")) >= 0;) {
      const line = buffer.slice(0, index); buffer = buffer.slice(index + 1);
      try {
        const message = JSON.parse(line) as ActorMessage;
        if (waiting) { const pending = waiting; waiting = undefined; pending.resolve(message); }
        else messages.push(message);
      } catch { waiting?.reject(new Error(`Invalid client fixture output: ${line}`)); waiting = undefined; }
    }
  });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => { errors += chunk; });
  child.on("error", (error) => { errors += error.message; waiting?.reject(error); waiting = undefined; });
  const exited = new Promise<void>((resolve) => child.once("close", () => {
    ended = true;
    waiting?.reject(new Error(`Owned client fixture exited before replying: ${errors}`));
    waiting = undefined;
    resolve();
  }));
  return {
    child, exited,
    next() {
      return new Promise<ActorMessage>((resolve, reject) => {
        if (messages.length) return resolve(messages.shift()!);
        if (ended) return reject(new Error(`Owned client fixture already exited: ${errors}`));
        const timer = setTimeout(() => { waiting = undefined; reject(new Error(`Owned client fixture timed out: ${errors}`)); }, 5000);
        waiting = {
          resolve(message) { clearTimeout(timer); resolve(message); },
          reject(error) { clearTimeout(timer); reject(error); },
        };
      });
    },
    command(command: string) { child.stdin.write(`${command}\n`); return this.next(); },
  };
}

test("real database clients reject a competing writer before ambient migration and reopen after a crash", { timeout: 25_000 }, async () => {
  mkdirSync(fixtureBase, { recursive: true });
  const root = mkdtempSync(join(fixtureBase, "client-writer-process-"));
  const profile = join(root, "profile");
  const ambientRoots = [
    join(root, "ambient-install"), join(root, "roaming", "QuickerAgent"),
    join(root, "local", "QuickerAgent"), join(root, "xdg-data", "QuickerAgent"),
  ];
  const actors: ReturnType<typeof actor>[] = [];
  const sentinels: { path: string; bytes: Buffer }[] = [];
  try {
    for (const directory of ambientRoots) {
      mkdirSync(join(directory, "local"), { recursive: true });
      mkdirSync(join(directory, ".local"), { recursive: true });
      for (const suffix of ["chats.db", join("local", "agent.db"), join(".local", "agent.db")]) {
        const path = join(directory, suffix);
        const database = new Database(path);
        database.exec("CREATE TABLE fixture_ambient_marker(value TEXT); INSERT INTO fixture_ambient_marker VALUES ('ambient-fixture-only')");
        database.close();
        sentinels.push({ path, bytes: readFileSync(path) });
      }
      writeFileSync(join(directory, "llm-secrets.json"), '{"marker":"ambient-fixture-only"}');
    }
    const first = actor(root, profile, ambientRoots);
    actors.push(first);
    assert.equal((await first.next()).event, "ready");
    const opened = await first.command("open");
    assert.equal(opened.event, "opened", opened.message);
    assert.equal(opened.databasePath, join(realpathSync(profile), "agent.db"));
    assert.equal(opened.hasAmbient, false);
    assert.equal(opened.secrets, null);
    assert.equal(opened.ambientTouches, 0);
    assert.equal((await first.command("seed")).event, "seeded");

    const second = actor(root, profile, ambientRoots);
    actors.push(second);
    assert.equal((await second.next()).event, "ready");
    const conflict = await second.command("open");
    assert.equal(conflict.event, "error");
    assert.equal(conflict.code, "AGENT_DATABASE_WRITER_BUSY");
    assert.equal(conflict.ambientTouches, 0);
    for (const sentinel of sentinels) assert.deepEqual(readFileSync(sentinel.path), sentinel.bytes);

    first.child.kill("SIGKILL");
    await first.exited;
    const recovered = actor(root, profile, ambientRoots);
    actors.push(recovered);
    assert.equal((await recovered.next()).event, "ready");
    const reopened = await recovered.command("open");
    assert.equal(reopened.event, "opened", reopened.message);
    assert.equal(reopened.databasePath, opened.databasePath);
    assert.equal(reopened.checkpoint, "preserved-before-crash");
    assert.equal(reopened.hasAmbient, false);
    assert.equal(reopened.secrets, null);
    assert.equal(reopened.ambientTouches, 0);
    recovered.child.stdin.write("exit\n");
    await recovered.exited;
    assert.equal(recovered.child.exitCode, 0);
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
