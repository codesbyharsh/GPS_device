import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import dotenv from 'dotenv'

// Load .env variables
dotenv.config()

export default defineConfig({
  plugins: [react()],
})
