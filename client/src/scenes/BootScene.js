// 에셋 로드 + 웹캠 권한 요청. 완료되면 로비로.

import Phaser from 'phaser';

export default class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    // TODO: 인장 아이콘, 캐릭터 스프라이트, 이펙트, 사운드 로드.
  }

  async create() {
    this.makeParticleTextures();

    const hint = this.add.text(40, 40, '웹캠 권한을 허용해주세요…', { fontSize: '24px' });

    await this.requestCamera();

    hint.destroy();
    // 흐름: Boot → CharacterSelect → Calibration → Lobby → Battle → Result
    this.scene.start('CharacterSelect');
  }

  // 에셋 파일 없이 코드로 파티클용 텍스처 생성 (게임 전역 TextureManager에 등록).
  makeParticleTextures() {
    if (this.textures.exists('spark')) return;
    // 흰색 원 (tint로 색 입힘)
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0xffffff, 1);
    g.fillCircle(8, 8, 8);
    g.generateTexture('spark', 16, 16);
    // 얇은 링 (술법 발동 확산)
    g.clear();
    g.lineStyle(6, 0xffffff, 1);
    g.strokeCircle(32, 32, 28);
    g.generateTexture('ring', 64, 64);
    g.destroy();
  }

  // 웹캠 스트림 확보 → 로컬 프리뷰(#local-cam)에 표시 + registry에 저장.
  // 저장된 스트림은 WebRTC 화상·MediaPipe 인식이 그대로 재사용한다.
  async requestCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false, // 음성은 WebRTC 화상에서 별도로. 지금은 카메라 권한만.
      });

      this.registry.set('localStream', stream);

      const el = document.getElementById('local-cam');
      if (el) {
        el.srcObject = stream;
        await el.play().catch(() => {}); // autoplay 정책 대비
      }
    } catch (err) {
      // 거부/장치 없음 — 게임 진입은 막지 않되, 인식이 필요한 씬에서 다시 안내.
      console.warn('[camera] 웹캠 사용 불가:', err.name, err.message);
      this.registry.set('cameraError', err.name);
    }
  }
}
