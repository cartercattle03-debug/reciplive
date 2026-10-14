const h = async (s) => "h:" + s; const c = async (s, x) => x === "h:" + s; module.exports = { hash: h, compare: c, default: { hash: h, compare: c } };
