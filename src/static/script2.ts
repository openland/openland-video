
(async () => {
    // Receiver Peer Connection
    let pc2 = new RTCPeerConnection({});
    pc2.oniceconnectionstatechange = () => {
        console.log('State: ' + pc2.iceConnectionState + '/' + pc2.connectionState);
    }
    pc2.onconnectionstatechange = () => {
        console.log('State: ' + pc2.iceConnectionState + '/' + pc2.connectionState);
    }
    console.log('State: ' + pc2.iceConnectionState + '/' + pc2.connectionState);

    pc2.ontrack = (e) => {
        console.log(e.track);
        var player = new Audio();
        player.srcObject = new MediaStream([e.track]);
        player.setAttribute('playsinline', 'true');
        player.play();
    };
    let offer2 = await (await fetch('/receive', { method: 'POST' })).text();
    console.log(offer2);
    await pc2.setRemoteDescription({ type: 'offer', sdp: offer2 });
    let answer2 = await pc2.createAnswer();
    console.log(answer2.sdp);
    await pc2.setLocalDescription(answer2);

    await (await fetch('/receive-answer', { method: 'POST', body: answer2.sdp as any })).text();
})();