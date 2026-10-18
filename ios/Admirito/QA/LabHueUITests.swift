import XCTest
final class LabHueTests: XCTestCase {
 @MainActor func testMascotLightingSequence() {
  continueAfterFailure=false
  let app=XCUIApplication(bundleIdentifier:"com.admira.admirito")
  app.terminate();app.launchArguments=["--admirito-ui-test"];app.launch()
  if app.buttons["petWake"].waitForExistence(timeout:8) {app.buttons["petWake"].tap()}
  XCTAssertTrue(app.buttons["petSelectBugito"].waitForExistence(timeout:12))
  for (id,name) in [("petSelectAdmirito","Admirito"),("petSelectBugito","Bugito"),("petSelectSupervisor","Supervisor")] {
   app.buttons[id].tap()
   let match=XCTNSPredicateExpectation(predicate:NSPredicate(format:"value == %@","Seleccionado"),object:app.buttons[id])
   XCTAssertEqual(XCTWaiter.wait(for:[match],timeout:10),.completed)
   print("HUE_NATIVE_MASCOT_"+name)
   Thread.sleep(forTimeInterval:10)
  }
  app.buttons["petClose"].tap();Thread.sleep(forTimeInterval:10)
  if app.buttons["petWake"].exists {app.buttons["petWake"].tap()}
  XCTAssertTrue(app.buttons["petSelectAdmirito"].exists)
  print("HUE_NATIVE_SEQUENCE_COMPLETED")
 }
}
