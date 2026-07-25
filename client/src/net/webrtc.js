// PeerJS 화상 — 소통 전용, 게임 판정과 무관. 실패해도 게임은 정상 진행되도록 격리.
// 매칭 시 peer id를 Socket.IO(EVENTS.PEER_ID)로 교환 → P2P 영상.
// glare(양쪽 동시 call) 방지: isInitiator(=입장한 쪽)만 call, 나머지는 answer.

import Peer from 'peerjs';
import { EVENTS } from '../../../shared/constants.js';

export function startVideoCall(socket, code, localStream, { isInitiator }) {
  const peer = new Peer();
  let myOpen = false;
  let remoteId = null;
  let called = false;

  peer.on('open', (myId) => {
    myOpen = true;
    socket.emit(EVENTS.PEER_ID, { code, peerId: myId });
    maybeCall();
  });

  // 상대 peer id 수신 (서버 중계)
  socket.off(EVENTS.PEER_ID); // 이전 매치의 잔여 핸들러 제거
  socket.on(EVENTS.PEER_ID, ({ peerId }) => {
    remoteId = peerId;
    maybeCall();
  });

  // answer 쪽: 걸려온 콜에 내 스트림으로 응답
  peer.on('call', (call) => {
    call.answer(localStream);
    call.on('stream', attachRemote);
  });

  // call 쪽: 내 peer 열림 + 상대 id 확보되면 한 번만 발신
  function maybeCall() {
    if (!isInitiator || called || !myOpen || !remoteId) return;
    called = true;
    const call = peer.call(remoteId, localStream);
    call.on('stream', attachRemote);
  }

  peer.on('error', (err) => {
    console.warn('[webrtc] 화상 실패, 게임엔 무영향:', err.type ?? err);
  });

  function attachRemote(remoteStream) {
    const el = document.getElementById('remote-cam');
    if (el) el.srcObject = remoteStream;
  }

  // 정리용: 씬 종료 시 호출
  function stop() {
    socket.off(EVENTS.PEER_ID);
    peer.destroy();
    const el = document.getElementById('remote-cam');
    if (el) el.srcObject = null;
  }

  return { peer, stop };
}
