import XCTest
final class LabCameraTests: XCTestCase {
    @MainActor func testRemoteInsta360Viewer() {
        continueAfterFailure=false
        let app=XCUIApplication(bundleIdentifier:"com.admira.admirito")
        app.terminate();app.launchArguments=["--admirito-ui-test"];app.launch()
        if app.buttons["petClose"].waitForExistence(timeout:4) {app.buttons["petClose"].tap()}
        let open=app.buttons["labCameraOpen"]
        for _ in 0..<4 {if open.exists {break};app.swipeUp()}
        XCTAssertTrue(open.waitForExistence(timeout:8));open.tap()
        let status=app.staticTexts["labCameraStatus"]
        let ready=XCTNSPredicateExpectation(predicate:NSPredicate(format:"label CONTAINS %@","imagen recibida"),object:status)
        XCTAssertEqual(XCTWaiter.wait(for:[ready],timeout:35),.completed)
        XCTAssertTrue(app.images["labCameraFrame"].exists)
        let image=XCTAttachment(screenshot:app.screenshot());image.name="Private Insta360 viewer on real iPhone";image.lifetime = .keepAlways;add(image)
        print("INSTA360_NATIVE_FRAME_VISIBLE");fflush(stdout)
        Thread.sleep(forTimeInterval:7)
        XCTAssertTrue(app.images["labCameraFrame"].exists)
        app.buttons["Cerrar"].tap()
        XCTAssertFalse(app.images["labCameraFrame"].exists)
        print("INSTA360_NATIVE_VIEWER_CLOSED");fflush(stdout)
    }
}
