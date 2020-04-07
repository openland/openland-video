
(async () => {
    let media = await navigator.mediaDevices.getUserMedia({ audio: true });

    // Sender Peer Connection
    let pc1 = new RTCPeerConnection({});
    pc1.oniceconnectionstatechange = () => {
        console.log('State: ' + pc1.iceConnectionState);
    }
    console.log('State: ' + pc1.iceConnectionState);

    for (let t of media.getTracks()) {
        pc1.addTransceiver(t, { direction: 'sendonly' });
    }

    // Create Offer
    let offer = await pc1.createOffer();
    await pc1.setLocalDescription(offer);
    console.log(offer.sdp);

    // Receive Answer
    let answer = await (await fetch('/offer', { method: 'POST', body: offer.sdp as any })).text();
    console.log(answer);

    // Set Answer
    await pc1.setRemoteDescription({ type: 'answer', sdp: answer });

    // // Received Peer Connection
    // let pc2 = new RTCPeerConnection({});
})();