// GAsTCA Offscreen Document - For playing audio notifications

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PLAY_CHACHING') {
    const audio = document.getElementById('chachingAudio');
    if (audio) {
      audio.currentTime = 0;
      audio.volume = 0.7;
      audio.play().catch(err => {
        console.log('[GAsTCA] Audio play failed:', err);
      });
    }
    sendResponse({ success: true });
  }
});
