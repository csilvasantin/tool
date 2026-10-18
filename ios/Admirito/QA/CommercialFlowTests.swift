import XCTest
// Physical device acceptance: official application UI, no credential injection.
final class CommercialFlowTests:XCTestCase {
 @MainActor func start() -> XCUIApplication {
  continueAfterFailure=false
  let app=XCUIApplication(bundleIdentifier:"com.admira.admirito");app.terminate();app.launchArguments=["--admirito-ui-test"];app.launch()
  if app.buttons["petClose"].exists{app.buttons["petClose"].tap()}
  let suite=app.buttons["AdmiraNeXT"]
  for _ in 0..<7{if suite.isHittable{break};app.swipeUp()}
  XCTAssertTrue(suite.waitForExistence(timeout:12));suite.tap()
  let field=app.descendants(matching:.any).matching(identifier:"suiteCommand").firstMatch
  for _ in 0..<7{if field.isHittable{break};app.swipeUp()}
  XCTAssertEqual(XCTWaiter.wait(for:[XCTNSPredicateExpectation(predicate:NSPredicate(format:"label CONTAINS %@","conectado"),object:app.staticTexts["suiteStatus"])],timeout:50),.completed)
  return app
 }
 @MainActor func send(_ app:XCUIApplication,_ command:String) {
  let field=app.descendants(matching:.any).matching(identifier:"suiteCommand").firstMatch
  for _ in 0..<7{if field.isHittable{break};app.swipeDown()}
  field.tap();if let value=field.value as? String,value.hasPrefix("/"){field.typeText(String(repeating:XCUIKeyboardKey.delete.rawValue,count:value.count))};field.typeText(command)
  app.buttons["suiteExecute"].tap()
 }
 @MainActor func webFill(_ app:XCUIApplication,_ label:String,_ value:String,_ multiline:Bool=false) {
 let field=multiline ? app.webViews.textViews[label] : app.webViews.textFields[label]
 XCTAssertTrue(field.waitForExistence(timeout:10),label)
 let web=multiline ? app.webViews.containing(.textView,identifier:label).firstMatch : app.webViews.containing(.textField,identifier:label).firstMatch
 for _ in 0..<7 {if field.isHittable{break};if field.frame.midY < web.frame.minY+70 {web.swipeDown()} else {web.swipeUp()}}
 field.tap();if !app.keyboards.firstMatch.waitForExistence(timeout:3){field.tap()};field.typeText(value)
 let done=app.buttons.matching(NSPredicate(format:"label MATCHES %@","^(OK|Done|Listo)$")).firstMatch
 if done.exists && done.isHittable {done.tap()}
 }
 @MainActor func webTap(_ app:XCUIApplication,_ label:String){let b=app.webViews.buttons[label];let web=app.webViews.containing(.button,identifier:label).firstMatch;for _ in 0..<9{if b.isHittable{break};if b.frame.midY < web.frame.minY+70{web.swipeDown()}else{web.swipeUp()}};XCTAssertTrue(b.isHittable,label);b.tap()}
 @MainActor func testCommercialMerchantFull(){let app=start();send(app,"/admirito comercial comercios");Thread.sleep(forTimeInterval:6);XCTAssertEqual(app.keyboards.count,0,"Execute must dismiss native keyboard");app.swipeUp();webFill(app,"Nombre del comercio","Prueba Comercial iPhone");webFill(app,"Ciudad","Barcelona");webFill(app,"Dirección","Direccion de prueba");webFill(app,"Número de pantallas","2");webTap(app,"Preparar ficha de captación");let result=app.webViews.staticTexts.matching(NSPredicate(format:"label CONTAINS %@","Captación de comercio · borrador")).firstMatch;XCTAssertTrue(result.waitForExistence(timeout:8));XCTAssertTrue(result.label.contains("Prueba Comercial iPhone"));XCTAssertTrue(result.label.contains("Pantallas: 2"));let shot=XCTAttachment(screenshot:app.screenshot());shot.name="Commercial merchant draft";shot.lifetime = .keepAlways;add(shot);print("IPHONE_MERCHANT_DRAFT_PASS")}
}
