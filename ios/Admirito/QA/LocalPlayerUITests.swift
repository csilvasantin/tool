import XCTest

final class LocalPlayerUITests: XCTestCase {
    @MainActor func testLocalIPhonePlayerFromExpert() {
        continueAfterFailure=false
        let phone=XCUIDevice.shared;phone.orientation = .portrait
        let app=XCUIApplication(bundleIdentifier:"com.admira.admirito")
        app.terminate();app.launchArguments=["--admirito-ui-test"];app.launch()
        if app.buttons["petClose"].waitForExistence(timeout:4) {app.buttons["petClose"].tap()}
        let suite=app.buttons["AdmiraNeXT"]
        for _ in 0..<5 {if suite.isHittable {break};app.swipeUp()}
        XCTAssertTrue(suite.waitForExistence(timeout:10));suite.tap()
        let field=app.descendants(matching:.any).matching(identifier:"suiteCommand").firstMatch
        for _ in 0..<6 {if field.exists && field.isHittable {break};app.swipeUp()}
        XCTAssertTrue(field.waitForExistence(timeout:15));field.tap()
        if let text=field.value as? String,!text.isEmpty {field.typeText(String(repeating:XCUIKeyboardKey.delete.rawValue,count:text.count))}
        field.typeText("/player starbucks alsea-sbux-021 Starbucks_PaseodeGracia_103_iPad_1")
        let execute=app.buttons["Ejecutar"]
        if !execute.isHittable {app.swipeUp()}
        XCTAssertTrue(execute.isEnabled);execute.tap()
        let state=app.staticTexts["localPlayerStatus"]
        let playing=XCTNSPredicateExpectation(predicate:NSPredicate(format:"label CONTAINS %@","Reproduciendo en este iPhone"),object:state)
        XCTAssertEqual(XCTWaiter.wait(for:[playing],timeout:65),.completed)
        XCTAssertTrue(app.staticTexts["localPlayerContext"].label.contains("Starbucks_PaseodeGracia_103_iPad_1"))
        let first=state.label;print("IPHONE_LOCAL_PLAYER_FIRST "+first);fflush(stdout)
        let a=XCTAttachment(screenshot:XCUIScreen.main.screenshot());a.name="iPhone native player - first decoded video";a.lifetime = .keepAlways;add(a)
        Thread.sleep(forTimeInterval:4)
        XCTAssertTrue(state.label.contains("Reproduciendo en este iPhone"));XCTAssertNotEqual(first,state.label)
        print("IPHONE_LOCAL_PLAYER_SECOND "+state.label);fflush(stdout)
        let b=XCTAttachment(screenshot:XCUIScreen.main.screenshot());b.name="iPhone native player - video clock advanced";b.lifetime = .keepAlways;add(b)
        app.buttons["localPlayerClose"].tap()
        XCTAssertFalse(state.exists)
        print("IPHONE_LOCAL_PLAYER_RETURNED_TO_EXPERT");fflush(stdout)
        let open=app.buttons["localPlayerOpen"]
        for _ in 0..<4 {if open.isHittable {break};app.swipeDown()}
        XCTAssertTrue(open.waitForExistence(timeout:10));open.tap()
        let setup=app.staticTexts["localPlayerSetupStatus"]
        XCTAssertEqual(XCTWaiter.wait(for:[XCTNSPredicateExpectation(predicate:NSPredicate(format:"label CONTAINS %@","Catálogo actualizado"),object:setup)],timeout:35),.completed)
        XCTAssertFalse(app.buttons["localPlayerStart"].isEnabled)
        XCTAssertTrue(app.buttons["localPlayerProject"].exists)
        app.buttons["localPlayerClose"].tap()
        print("IPHONE_LOCAL_PLAYER_SELECTOR_REOPENED_WITHOUT_STALE_TARGET");fflush(stdout)
    }
    @MainActor func testLocalIPhonePlayerSelection() {
        continueAfterFailure=false
        let app=XCUIApplication(bundleIdentifier:"com.admira.admirito")
        app.terminate();app.launchArguments=["--admirito-ui-test"];app.launch()
        if app.buttons["petClose"].waitForExistence(timeout:3) {app.buttons["petClose"].tap()}
        let suite=app.buttons["AdmiraNeXT"]
        for _ in 0..<5 {if suite.isHittable {break};app.swipeUp()}
        if suite.isHittable {suite.tap()}
        let open=app.buttons["localPlayerOpen"]
        for _ in 0..<6 {if open.isHittable {break};app.swipeUp()}
        XCTAssertTrue(open.waitForExistence(timeout:10));open.tap()
        let project=app.buttons["localPlayerProject"]
        XCTAssertTrue(project.waitForExistence(timeout:35));project.tap()
        app.buttons["starbucks"].tap()
        let search=app.textFields["localPlayerSearch"];search.tap();search.typeText("Paseo de Gracia\n")
        app.buttons["localPlayerLocation"].tap()
        app.buttons["Starbucks Paseo de Gracia"].tap()
        let devicePicker=app.buttons["localPlayerDevice"]
        XCTAssertEqual(XCTWaiter.wait(for:[XCTNSPredicateExpectation(predicate:NSPredicate(format:"hittable == true"),object:devicePicker)],timeout:10),.completed)
        devicePicker.tap()
        app.buttons["iPad horizontal"].tap()
        if !app.buttons["localPlayerStart"].exists {
            let back=app.navigationBars.buttons.firstMatch
            if back.exists && back.label != "Volver a Admirito" {back.tap()}
        }
        let start=app.buttons["localPlayerStart"]
        XCTAssertEqual(XCTWaiter.wait(for:[XCTNSPredicateExpectation(predicate:NSPredicate(format:"enabled == true"),object:start)],timeout:5),.completed);start.tap()
        let state=app.staticTexts["localPlayerStatus"]
        XCTAssertEqual(XCTWaiter.wait(for:[XCTNSPredicateExpectation(predicate:NSPredicate(format:"label CONTAINS %@","Reproduciendo en este iPhone"),object:state)],timeout:60),.completed)
        print("IPHONE_PLAYER_THREE_SELECTORS_CONFIRMED");fflush(stdout)
        let shot=XCTAttachment(screenshot:XCUIScreen.main.screenshot());shot.name="iPhone - project, location and IoT selected";shot.lifetime = .keepAlways;add(shot)
        app.buttons["localPlayerClose"].tap()
    }

    @MainActor func testLocalIPhonePlayerUnavailableAssignmentThenVisiblePlayback() {
        continueAfterFailure=false
        let app=XCUIApplication(bundleIdentifier:"com.admira.admirito")
        app.terminate();app.launchArguments=["--admirito-ui-test"];app.launch()
        if app.buttons["petClose"].waitForExistence(timeout:3) {app.buttons["petClose"].tap()}
        let suite=app.buttons["AdmiraNeXT"]
        for _ in 0..<5 {if suite.isHittable {break};app.swipeUp()}
        if suite.isHittable {suite.tap()}
        let field=app.descendants(matching:.any).matching(identifier:"suiteCommand").firstMatch
        for target in ["Starbucks_PaseodeGracia_103_Pantalla_1","Starbucks_PaseodeGracia_103_iPad_1"] {
            for _ in 0..<6 {if field.isHittable {break};app.swipeUp()}
            XCTAssertTrue(field.waitForExistence(timeout:10));field.tap()
            if let text=field.value as? String,!text.isEmpty {field.typeText(String(repeating:XCUIKeyboardKey.delete.rawValue,count:text.count))}
            field.typeText("/player starbucks alsea-sbux-021 "+target)
            let execute=app.buttons["Ejecutar"];if !execute.isHittable {app.swipeUp()};execute.tap()
            if target.contains("Pantalla") {
                let state=app.staticTexts["localPlayerSetupStatus"]
                XCTAssertEqual(XCTWaiter.wait(for:[XCTNSPredicateExpectation(predicate:NSPredicate(format:"label CONTAINS %@","no tiene una playlist reproducible"),object:state)],timeout:40),.completed)
                XCTAssertFalse(app.staticTexts["localPlayerStatus"].exists)
                print("IPHONE_PLAYER_EMPTY_ASSIGNMENT_REJECTED_WITHOUT_FALLBACK");fflush(stdout)
                app.buttons["localPlayerClose"].tap()
            } else {
                let state=app.staticTexts["localPlayerStatus"]
                XCTAssertEqual(XCTWaiter.wait(for:[XCTNSPredicateExpectation(predicate:NSPredicate(format:"label CONTAINS %@","Reproduciendo en este iPhone"),object:state)],timeout:60),.completed)
                XCUIApplication(bundleIdentifier:"com.apple.Preferences").activate();Thread.sleep(forTimeInterval:2);app.activate()
                XCTAssertTrue(app.buttons["localPlayerResume"].waitForExistence(timeout:10))
                XCTAssertTrue(state.label.contains("detenido"))
                app.buttons["localPlayerResume"].tap()
                XCTAssertEqual(XCTWaiter.wait(for:[XCTNSPredicateExpectation(predicate:NSPredicate(format:"label CONTAINS %@","Reproduciendo en este iPhone"),object:state)],timeout:25),.completed)
                print("IPHONE_PLAYER_BACKGROUND_PAUSED_AND_EXPLICIT_RESUME_CONFIRMED");fflush(stdout)
                Thread.sleep(forTimeInterval:3)
                let shot=XCTAttachment(screenshot:XCUIScreen.main.screenshot());shot.name="iPhone player - final visible assigned video";shot.lifetime = .keepAlways;add(shot)
                print("IPHONE_PLAYER_FINAL_VISIBLE "+state.label);fflush(stdout)
            }
        }
    }

    @MainActor func testDualPhoneModes() {
        continueAfterFailure=false
        let phone=XCUIDevice.shared;phone.orientation = .portrait
        let app=XCUIApplication(bundleIdentifier:"com.admira.admirito")
        app.terminate();app.launchArguments=["--admirito-ui-test"];app.launch()
        if app.buttons["petClose"].waitForExistence(timeout:4) {app.buttons["petClose"].tap()}
        let suite=app.buttons["AdmiraNeXT"]
        for _ in 0..<5 {if suite.isHittable {break};app.swipeUp()}
        XCTAssertTrue(suite.waitForExistence(timeout:10));suite.tap()
        let field=app.descendants(matching:.any).matching(identifier:"suiteCommand").firstMatch
        for _ in 0..<6 {if field.exists && field.isHittable {break};app.swipeUp()}
        XCTAssertTrue(field.waitForExistence(timeout:15));field.tap()
        if let text=field.value as? String,!text.isEmpty {field.typeText(String(repeating:XCUIKeyboardKey.delete.rawValue,count:text.count))}
        field.typeText("/player starbucks alsea-sbux-021 Starbucks_PaseodeGracia_103_iPad_1")
        let execute=app.buttons["Ejecutar"]
        if !execute.isHittable {app.swipeUp()}
        XCTAssertTrue(execute.isEnabled);execute.tap()
        let state=app.staticTexts["localPlayerStatus"]
        let playing=XCTNSPredicateExpectation(predicate:NSPredicate(format:"label CONTAINS %@","Reproduciendo en este iPhone"),object:state)
        XCTAssertEqual(XCTWaiter.wait(for:[playing],timeout:65),.completed)
        XCTAssertTrue(app.staticTexts["localPlayerContext"].label.contains("Starbucks_PaseodeGracia_103_iPad_1"))
        let first=state.label;print("IPHONE_LOCAL_PLAYER_FIRST "+first);fflush(stdout)
        let a=XCTAttachment(screenshot:XCUIScreen.main.screenshot());a.name="iPhone native player - first decoded video";a.lifetime = .keepAlways;add(a)
        Thread.sleep(forTimeInterval:4)
        XCTAssertTrue(state.label.contains("Reproduciendo en este iPhone"));XCTAssertNotEqual(first,state.label)
        print("IPHONE_LOCAL_PLAYER_SECOND "+state.label);fflush(stdout)
        let b=XCTAttachment(screenshot:XCUIScreen.main.screenshot());b.name="iPhone native player - video clock advanced";b.lifetime = .keepAlways;add(b)
        app.buttons["localPlayerSync"].tap()
        let locked=XCTNSPredicateExpectation(predicate:NSPredicate(format:"label CONTAINS %@","Sincronizado · pieza"),object:state)
        XCTAssertEqual(XCTWaiter.wait(for:[locked],timeout:65),.completed)
        for _ in 0..<15 { print("IPHONE_SYNC_SAMPLE "+state.label);fflush(stdout);Thread.sleep(forTimeInterval:2) }
        let c=XCTAttachment(screenshot:XCUIScreen.main.screenshot());c.name="iPhone synchronized assigned playlist";c.lifetime = .keepAlways;add(c)
    }
}
