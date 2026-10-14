exports.cookies = () => ({ get: (n) => (n === "rl_year" && global.YEAR ? { value: String(global.YEAR) } : undefined) });
