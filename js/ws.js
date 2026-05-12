const WS = (() => {
    let client = null;
    const WS_BASE = "http://159.223.43.225:8080";

    function connect() {
        if (client) {
            try { client.deactivate(); } catch (e) {}
        }

        const t = API.token();
        const url = WS_BASE + "/ws/canvas" + (t ? "?token=" + encodeURIComponent(t) : "");

        client = new StompJs.Client({
            webSocketFactory: () => new SockJS(url),
            reconnectDelay: 5000,
            heartbeatIncoming: 10000,
            heartbeatOutgoing: 10000,
            debug: () => {}
        });

        client.onConnect = () => {
            console.log("WS connected");
            client.subscribe("/topic/pixels", msg => {
                const evt = JSON.parse(msg.body);
                Canvas.renderPixel(evt.x, evt.y, evt.color);
            });
        };

        client.onStompError = frame => {
            console.error("STOMP error", frame.headers, frame.body);
        };

        client.activate();
    }

    return { connect };
})();