#!/usr/bin/env node
// Runs the TypeScript CLI without a build step: workspace packages export TypeScript sources.
import { register } from 'tsx/esm/api';

register();
await import('../src/bin.ts');
