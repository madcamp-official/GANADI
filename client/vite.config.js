import { defineConfig } from 'vite';

// getUserMedia 제약: 로컬 개발도 https 또는 localhost 필요.
// 다른 PC에서 접속해 실대전 테스트하려면 아래 https 옵션을 켜고 인증서를 설정.
export default defineConfig({
  server: {
    host: true, // LAN 노출 (실대전 테스트용)
    allowedHosts: ['.madcamp-kaist.org'],
    // https: true,
  },
});
