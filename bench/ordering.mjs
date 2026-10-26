import { performance } from "node:perf_hooks";
import { createQueryable, SORT, SORT_BY, TOP_K, VALUES } from "../dist/index.js";

// Run separately from correctness tests: pnpm build && node bench/ordering.mjs.
// Timing includes fresh result extraction; selectors return identical keys for
// cheap and expensive cases so callback work is the only intended difference.
const repeats = 5;
let checksum = 0;
console.log(`Node ${process.version}; ${process.platform}/${process.arch}; median of ${repeats} runs`);
console.log("| N | K | selector | operation | median ms | selector calls/run |");
console.log("| --- | --- | --- | --- | --- | --- |");
for (const n of [1000, 10000]) {
  const query = createQueryable(Object.fromEntries(
    Array.from({ length: n }, (_, i) => [`k${i}`, (i * 7919) % n]),
  ));
  for (const k of [1, Math.floor(n / 10), n]) {
    for (const expensive of [false, true]) {
      for (const operation of ["SORT", "SORT_BY", "TOP_K"]) {
        const times = [];
        let calls = 0;
        const select = value => {
          calls++;
          if (expensive) {
            let hash = value;
            for (let i = 0; i < 100; i++) { hash = Math.imul(hash ^ i, 16777619); }
            // Keep the expensive work observable without changing the ordering.
            checksum ^= hash;
          }
          return value;
        };
        const rule = { select };
        const run = () => operation === "SORT"
          ? query[SORT]((a, b) => select(a) - select(b))[VALUES]().slice(0, k)
          : operation === "SORT_BY"
            ? query[SORT_BY](rule)[VALUES]().slice(0, k)
            : query[TOP_K](k, rule)[VALUES]();
        run();
        calls = 0;
        for (let i = 0; i < repeats; i++) {
          const start = performance.now();
          const result = run();
          times.push(performance.now() - start);
          if (result.length !== k) { throw new Error("incorrect winner count"); }
        }
        times.sort((a, b) => a - b);
        console.log(`| ${n} | ${k} | ${expensive ? "100 hash rounds" : "identity"} | ${operation} | ${times[2].toFixed(3)} | ${calls / repeats} |`);
      }
    }
  }
}
console.log(`Selector checksum: ${checksum}`);
