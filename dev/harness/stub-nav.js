exports.redirect = (u) => { const e = new Error("REDIRECT " + u); e.redirect = u; throw e; };
exports.useRouter = () => ({ refresh() {}, push() {}, replace() {}, back() {} });
exports.usePathname = () => global.PATH || "/";
