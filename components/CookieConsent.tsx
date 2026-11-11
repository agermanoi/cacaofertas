/**
 * Aviso de cookies (LGPD): barra discreta no rodapé, com Aceitar e Recusar.
 * Feito em HTML + script próprio (sem depender do React carregar), para os botões responderem
 * sempre, em qualquer navegador. A escolha fica em localStorage (co_consent) e atualiza o
 * Consent Mode do Google e os anúncios do GAM na hora.
 */
const SCRIPT = `(function(){
  if(location.pathname.indexOf('/admin')===0)return;
  var bar=document.getElementById('cookie-bar');if(!bar)return;
  function get(){try{return localStorage.getItem('co_consent')}catch(e){return null}}
  function apply(c){
    var v=c==='granted'?'granted':'denied';
    try{if(window.gtag)gtag('consent','update',{ad_storage:v,ad_user_data:v,ad_personalization:v,analytics_storage:v});}catch(e){}
    try{var g=window.googletag;if(g&&g.cmd)g.cmd.push(function(){g.pubads().setPrivacySettings({nonPersonalizedAds:c!=='granted'})});}catch(e){}
  }
  function choose(c){bar.hidden=true;try{localStorage.setItem('co_consent',c)}catch(e){}apply(c);}
  bar.addEventListener('click',function(e){var b=e.target.closest&&e.target.closest('[data-consent]');if(b){e.preventDefault();choose(b.getAttribute('data-consent'));}});
  document.addEventListener('click',function(e){var l=e.target.closest&&e.target.closest('[data-cookie-prefs]');if(l){e.preventDefault();bar.hidden=false;}});
  if(!get())bar.hidden=false;
})();`;

export function CookieConsent() {
  return (
    <>
      <div id="cookie-bar" className="cookie-bar" role="dialog" aria-live="polite" aria-label="Aviso de cookies" hidden suppressHydrationWarning>
        <p>
          Usamos cookies para medir a audiência e para anúncios. Sem o seu aceite, os anúncios não são personalizados.{" "}
          <a href="/politica-de-privacidade#cookies">Saiba mais</a>
        </p>
        <div className="cookie-actions">
          <button type="button" className="btn btn-ghost" data-consent="denied">
            Recusar
          </button>
          <button type="button" className="btn" data-consent="granted">
            Aceitar
          </button>
        </div>
      </div>
      <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />
    </>
  );
}

/** Link do rodapé para rever a escolha (o script do aviso cuida do clique). */
export function CookiePrefsLink() {
  return (
    <button type="button" className="link-button" data-cookie-prefs="">
      Preferências de cookies
    </button>
  );
}
