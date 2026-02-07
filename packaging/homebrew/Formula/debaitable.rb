class Debaitable < Formula
  desc "Terminal-based multi-role debate engine for structured decisions"
  homepage "https://github.com/masonliiu/debaitable"
  url "https://registry.npmjs.org/debaitable/-/debaitable-0.0.2.tgz"
  sha256 "db17d75bcb90081ca8630edc64f86c6b75e81855fbbc4908c3bc22260824ea6c"

  depends_on "node"

  def install
    libexec.install Dir["*"]
    (bin/"debaitable").write <<~SH
      #!/bin/bash
      exec "#{Formula["node"].opt_bin}/node" "#{libexec}/dist/main.js" "$@"
    SH
  end

  test do
    assert_path_exists bin/"debaitable"
  end
end
