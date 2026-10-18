# Comercial en iPhone y Fold

Desde el modo Experto de Admirito, `/comercial` o `/admirito comercial` abre campañas. `/comercial comercios` o `/admirito comercial comercios` abre captación de comercios, locales y pantallas. Ambos utilizan el motor canónico de la suite y la interfaz de admira.biz.

La versión 20261018.11 (iOS build 36, Android code 14) cierra el teclado nativo del iPhone al pulsar Ejecutar. Así la interfaz web queda disponible para completar el formulario. Se mantienen los permisos propios de cada sitio y la identificación web existente.

La prueba física prepara una propuesta con presupuesto de 500 EUR y seis puntos del circuito Xtanco Nacional, conservando las advertencias de demostración y disponibilidad. La captación prepara una ficha con nombre, ciudad, dirección y dos pantallas; el alta continúa en el portal existente. Los datos de prueba son ficticios y no se registran clientes ni se publican campañas.

La regresión de captación y cierre de teclado está en `ios/Admirito/QA/CommercialFlowTests.swift`, para un target XCTest UI de dispositivo físico. La evidencia y resultados finales se conservan en la bóveda `ADMIRITO_COMERCIAL`.

## English

Expert commands open the same Commercial application and shared command engine on both phones. Release 20261018.11 dismisses the native iPhone keyboard when Execute is pressed. Physical acceptance prepares an advertiser campaign draft using six explicitly selected catalogue locations, and a merchant recruitment brief with two screens. Existing authentication, demonstration provenance and availability qualifications remain in place. Recruitment continues in the existing merchant portal; these checks use fictional data and create no customer registrations or published campaigns.

## Resultado físico · 18 octubre 2026

Campaña y captación completadas en los dos teléfonos con 20261018.11 instalado. El iPhone queda mostrando la propuesta con la consola limpia; el Fold muestra su propuesta. La campaña incorpora seis ubicaciones y conserva sus avisos de demostración. La ficha de captación contiene dos pantallas.

El APK compilado, el instalado en el Fold y el descargado del enlace público coinciden por SHA-256. Compilación iOS firmada, Android release y lint, y 1674 pruebas del sitio correctas. [Verificación estructurada](evidence/admirito-comercial-mobile-2026-10-18/verification.json). Las capturas completas de los teléfonos quedan privadas en la bóveda.

Physical result: both campaign and merchant drafts passed on the physical iPhone and Fold, running 20261018.11. The iPhone keyboard dismissal and cleared console passed. Public, built and installed Android APK hashes match. Full phone screenshots remain private in the vault.
