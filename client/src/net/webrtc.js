// PeerJS 화상 — 소통 전용, 게임 판정과 무관. 실패해도 게임은 정상 진행되도록 격리.
// 매칭 시 peer id를 Socket.IO(EVENTS.PEER_ID)로 교환 → P2P 영상.

import Peer from 'peerjs';
import { EVENTS } from '../../../shared/constants.js';

export function startVideoCall(socket, code, localStream) {
  const peer = new Peer();

  peer.on('open', (peerId) => {
    socket.emit(EVENTS.PEER_ID, { code, peerId });
  });

  // 상대 peer id를 받으면 내가 call, 상대는 answer.
  socket.on(EVENTS.PEER_ID, ({ peerId }) => {
    const call = peer.call(peerId, localStream);
    call.on('stream', attachRemote);
  });
  peer.on('call', (call) => {
    call.answer(localStream);
    call.on('stream', attachRemote);
  });

  peer.on('error', (err) => console.warn('[webrtc] 화상 실패, 게임엔 무영향:', err));

  function attachRemote(remoteStream) {
    const el = document.getElementById('remote-cam');
    if (el) el.srcObject = remoteStream;
  }

  return peer;
}
