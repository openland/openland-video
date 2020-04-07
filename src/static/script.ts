
(async () => {
    let devices = await navigator.mediaDevices.enumerateDevices();
    console.log(devices);
    let media = await navigator.mediaDevices.getUserMedia({ audio: true });

    // Sender Peer Connection
    let pc1 = new RTCPeerConnection({});
    pc1.oniceconnectionstatechange = () => {
        console.log('State: ' + pc1.iceConnectionState + '/' + pc1.connectionState);
    }
    pc1.onconnectionstatechange = () => {
        console.log('State: ' + pc1.iceConnectionState + '/' + pc1.connectionState);
    }
    console.log('State: ' + pc1.iceConnectionState + '/' + pc1.connectionState);

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

    // Receiver Peer Connection
    // let pc2 = new RTCPeerConnection({});
    // pc2.oniceconnectionstatechange = () => {
    //     console.log('State2: ' + pc2.iceConnectionState + '/' + pc2.connectionState);
    // }
    // pc2.onconnectionstatechange = () => {
    //     console.log('State2: ' + pc2.iceConnectionState + '/' + pc2.connectionState);
    // }
    // console.log('State2: ' + pc2.iceConnectionState + '/' + pc2.connectionState);

    // pc2.ontrack = (e) => {
    //     console.log(e.track);
    //     var player = new Audio();
    //     player.srcObject = new MediaStream([e.track]);
    //     player.play();
    // };
    // let offer2 = await (await fetch('/receive', { method: 'POST' })).text();
    // console.log(offer2);
    // await pc2.setRemoteDescription({ type: 'offer', sdp: offer2 });
    // let answer2 = await pc2.createAnswer();
    // console.log(answer2.sdp);
    // await pc2.setLocalDescription(answer2);
})();