(function () {
    if (!window.ZentroWidget || !window.ZentroWidget.token) return;

    var token = window.ZentroWidget.token;
    var baseUrl = 'https://zentro-desk-crm.vercel.app';

    // Inject iframe
    var iframe = document.createElement('iframe');
    iframe.src = baseUrl + '/widget.html?token=' + encodeURIComponent(token) + '&origin=' + encodeURIComponent(window.location.origin);
    iframe.id = 'zentro-widget-iframe';
    iframe.style.cssText = [
        'position:fixed',
        'bottom:20px',
        'right:20px',
        'width:60px',
        'height:60px',
        'border:none',
        'border-radius:50%',
        'z-index:2147483647',
        'transition:all 0.3s ease',
        'box-shadow:0 4px 24px rgba(0,0,0,0.18)',
        'overflow:hidden',
        'background:transparent',
    ].join(';');
    document.body.appendChild(iframe);

    // Listen for resize messages from widget
    window.addEventListener('message', function (e) {
        if (!e.data || e.data.source !== 'zentro-widget') return;
        if (e.data.type === 'resize') {
            var el = document.getElementById('zentro-widget-iframe');
            if (!el) return;
            if (e.data.open) {
                el.style.width = '380px';
                el.style.height = '600px';
                el.style.borderRadius = '16px';
                el.style.bottom = '20px';
                el.style.right = '20px';
            } else {
                el.style.width = '60px';
                el.style.height = '60px';
                el.style.borderRadius = '50%';
            }
        }
    });
})();