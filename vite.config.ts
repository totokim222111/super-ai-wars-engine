import {defineConfig} from 'vitest/config';
import {releaseData} from './tools/release-data.ts';
export default defineConfig({base:'./',build:{outDir:process.env.OUT_DIR??'dist',emptyOutDir:true,target:'es2022',assetsInlineLimit:0,rollupOptions:{input:{game:'game.html',v2:'v2.html'}}},plugins:[releaseData()],test:{environment:'node',include:['tests/**/*.test.ts']}});
