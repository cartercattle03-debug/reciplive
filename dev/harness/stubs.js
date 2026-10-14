// Runtime stand-ins for the offline tests: the Prisma client is the in-memory fake, the rest is just enough.
const Module = require("module");
const path = require("path");
const OUT = process.env.RL_OUT || "/tmp/rltc/out";
const HERE = __dirname;
const map = {
  "@prisma/client": path.join(process.env.RL_TC || "/tmp/rltc", "fakeprisma2.js"),
  "next-auth": path.join(HERE, "stub-nextauth.js"),
  "next-auth/providers/credentials": path.join(HERE, "stub-cred.js"),
  "next/navigation": path.join(HERE, "stub-nav.js"),
  bcryptjs: path.join(HERE, "stub-bcrypt.js"),
  "next/link": path.join(HERE, "stub-link.js"),
  "next/headers": path.join(HERE, "stub-headers.js"),
  react: require.resolve("/home/claude/.npm-global/lib/node_modules/react"),
  "react/jsx-runtime": require.resolve("/home/claude/.npm-global/lib/node_modules/react/jsx-runtime"),
  "react-dom/server": require.resolve("/home/claude/.npm-global/lib/node_modules/react-dom/server"),
  xlsx: path.join(HERE, "stub-link.js"),
};
const orig = Module._resolveFilename;
Module._resolveFilename = function (req, parent, ...rest) {
  if (map[req]) return map[req];
  if (req.startsWith("@/")) return orig.call(this, path.join(OUT, "src", req.slice(2)), parent, ...rest);
  return orig.call(this, req, parent, ...rest);
};
