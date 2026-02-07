class Debaitable < Formula
  desc "Terminal-based multi-role debate engine for structured decisions"
  homepage "https://github.com/masonliiu/DebAItable"
  url "https://registry.npmjs.org/debaitable/-/debaitable-0.0.2.tgz"
  sha256 "db17d75bcb90081ca8630edc64f86c6b75e81855fbbc4908c3bc22260824ea6c"

  depends_on "node"

  def install
    libexec.install Dir["*"]
    (bin/"debaitable").write_env_script Formula["node"].opt_bin/"node", libexec/"dist/main.js"
  end

  test do
    assert_predicate bin/"debaitable", :exist?
  end
end
