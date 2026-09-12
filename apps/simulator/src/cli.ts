import { simulateAtomicRoute, type AtomicSimulationInput } from "./simulator";

const input = JSON.parse(await Bun.stdin.text()) as AtomicSimulationInput;
const result = await simulateAtomicRoute(input);
process.stdout.write(`${JSON.stringify(result)}\n`);
