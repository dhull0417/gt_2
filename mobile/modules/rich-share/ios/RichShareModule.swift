import ExpoModulesCore
import LinkPresentation
import UIKit

// Share sheet whose preview header shows a title and picture (group photo or GroupThat logo),
// while every app receives only the message text. See modules/rich-share/index.ts.
public final class RichShareModule: Module {
  public func definition() -> ModuleDefinition {
    Name("RichShare")

    AsyncFunction("share") { (message: String, title: String, imageUri: String?, promise: Promise) in
      guard let presenter = self.appContext?.utilities?.currentViewController() else {
        throw MissingViewControllerException()
      }

      let item = RichShareItem(message: message, title: title, image: RichShareModule.loadImage(imageUri))
      let controller = UIActivityViewController(activityItems: [item], applicationActivities: nil)

      // iOS can call this more than once (e.g. after a share extension finishes); answer JS once.
      var answered = false
      controller.completionWithItemsHandler = { _, completed, _, _ in
        guard !answered else { return }
        answered = true
        promise.resolve(completed ? "shared" : "dismissed")
      }

      // iPad presents the share sheet as a popover, which needs an anchor.
      if UIDevice.current.userInterfaceIdiom == .pad {
        let frame = presenter.view.bounds
        controller.popoverPresentationController?.sourceView = presenter.view
        controller.popoverPresentationController?.sourceRect = CGRect(x: frame.midX, y: frame.midY, width: 0, height: 0)
        controller.popoverPresentationController?.permittedArrowDirections = []
      }

      presenter.present(controller, animated: true)
    }
    .runOnQueue(.main)
  }

  /// Only local files the app wrote (cached group photo, bundled logo).
  static func loadImage(_ uri: String?) -> UIImage? {
    guard let uri = uri, let url = URL(string: uri), url.isFileURL else { return nil }
    return UIImage(contentsOfFile: url.path)
  }
}

final class RichShareItem: NSObject, UIActivityItemSource {
  private let message: String
  private let title: String
  private let image: UIImage?

  init(message: String, title: String, image: UIImage?) {
    self.message = message
    self.title = title
    self.image = image
    super.init()
  }

  func activityViewControllerPlaceholderItem(_ activityViewController: UIActivityViewController) -> Any {
    return message
  }

  // Every app gets exactly the message text (nothing attached).
  func activityViewController(_ activityViewController: UIActivityViewController, itemForActivityType activityType: UIActivity.ActivityType?) -> Any? {
    return message
  }

  // Used as the subject line by Mail.
  func activityViewController(_ activityViewController: UIActivityViewController, subjectForActivityType activityType: UIActivity.ActivityType?) -> String {
    return title
  }

  // The share sheet's preview header.
  func activityViewControllerLinkMetadata(_ activityViewController: UIActivityViewController) -> LPLinkMetadata? {
    let metadata = LPLinkMetadata()
    metadata.title = title
    if let image = image {
      metadata.iconProvider = NSItemProvider(object: image)
      metadata.imageProvider = NSItemProvider(object: image)
    }
    return metadata
  }
}

internal final class MissingViewControllerException: Exception {
  override var reason: String {
    "There is no screen to show the share sheet from."
  }
}
