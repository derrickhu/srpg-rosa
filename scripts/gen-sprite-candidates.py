#!/usr/bin/env python3
"""生成若干候选 sprite sheet，用 generate2dsprite 的 QC 指标自动挑最好的那张。

生图是随机的：同一个 prompt 反复跑，会随机出现背景变黑、画上帧名文字、肢体/武器穿出格子
边界这些硬伤。靠单次运气 + 肉眼复查很费时间，而这些硬伤全都能程序化判定：

  * 背景变黑     —— 数品红像素占比
  * 穿出格子边界 —— process 的 source_edge_touch_frames
  * 抠出空帧     —— process 的 empty_frames
  * 各帧体型不一 —— process 的 body_scale_cv / anchor_y_std

所以这里采样 N 张，先淘汰硬伤，再按体型一致性排序取最优，最后统一做 despill。
文字水印仍需人眼复查，脚本会保留所有候选便于对比。

用法：
    python3 scripts/gen-sprite-candidates.py \\
      --prompt docs/prompt/unit_bloodfang_attack_down_prompt.txt \\
      --ref art/sprite-runs/bloodfang/identity-ref.png \\
      --out-dir art/sprite-runs/bloodfang/attack_down \\
      --rows 2 --cols 2 --label-prefix atk \\
      --scale-profile art/sprite-runs/bloodfang/scale-profile.json \\
      --attempts 4
"""

from __future__ import annotations

import argparse
import json
import pathlib
import shutil
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image

GEMINI = pathlib.Path.home() / ".cursor/skills/gemini-image-gen/scripts/generate_images.py"
SPRITE = pathlib.Path.home() / ".cursor/skills/generate2dsprite/scripts/generate2dsprite.py"
DESPILL = pathlib.Path(__file__).parent / "despill-magenta.py"

# 背景品红像素占比低于此值，说明模型没按键色画（最常见是整张变黑），直接淘汰
MIN_MAGENTA_RATIO = 0.35


def magenta_ratio(path: pathlib.Path) -> float:
    a = np.array(Image.open(path).convert("RGB")).astype(int)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    return float(((r > 200) & (b > 200) & (g < 80)).mean())


def generate(prompt: pathlib.Path, ref: pathlib.Path | None, out: pathlib.Path) -> bool:
    cmd = [
        sys.executable, str(GEMINI),
        "--prompt-file", str(prompt),
        "--output", str(out),
        "--aspect-ratio", "1:1",
        "--image-size", "1K",
    ]
    if ref:
        cmd += ["--image", str(ref)]
    subprocess.run(cmd, capture_output=True)
    return out.exists()


def process(raw: pathlib.Path, out_dir: pathlib.Path, args: argparse.Namespace) -> dict | None:
    cmd = [
        sys.executable, str(SPRITE), "process",
        "--input", str(raw),
        "--target", args.target,
        "--mode", args.mode,
        "--output-dir", str(out_dir),
        "--cell-size", str(args.cell_size),
        "--align", args.align,
        "--shared-scale",
        "--component-mode", args.component_mode,
        "--threshold", str(args.threshold),
        "--edge-threshold", str(args.edge_threshold),
    ]
    if args.rows and args.cols:
        cmd += ["--rows", str(args.rows), "--cols", str(args.cols)]
    if args.label_prefix:
        cmd += ["--label-prefix", args.label_prefix]
    if args.scale_profile:
        cmd += ["--scale-profile", str(args.scale_profile)]
    r = subprocess.run(cmd, capture_output=True, text=True)
    meta_path = out_dir / "pipeline-meta.json"
    if r.returncode != 0 or not meta_path.exists():
        return None
    return json.loads(meta_path.read_text())


def main() -> int:
    ap = argparse.ArgumentParser(description="采样多张候选 sprite sheet 并按 QC 择优")
    ap.add_argument("--prompt", type=pathlib.Path, required=True)
    ap.add_argument("--ref", type=pathlib.Path, help="单帧身份参考图（勿传整张 sheet，布局会被锚定）")
    ap.add_argument("--out-dir", type=pathlib.Path, required=True)
    ap.add_argument("--attempts", type=int, default=4)
    ap.add_argument("--target", default="player")
    ap.add_argument("--mode", default="attack")
    ap.add_argument("--rows", type=int)
    ap.add_argument("--cols", type=int)
    ap.add_argument("--label-prefix")
    ap.add_argument("--cell-size", type=int, default=256)
    ap.add_argument("--align", default="feet", choices=["center", "bottom", "feet"])
    ap.add_argument("--component-mode", default="largest", choices=["all", "largest"])
    ap.add_argument("--threshold", type=int, default=120)
    ap.add_argument("--edge-threshold", type=int, default=240)
    ap.add_argument("--scale-profile", type=pathlib.Path)
    ap.add_argument("--keep-candidates", type=pathlib.Path, default=pathlib.Path(".tmp-gen/candidates"))
    args = ap.parse_args()

    args.keep_candidates.mkdir(parents=True, exist_ok=True)
    slug = args.prompt.stem
    best: tuple[float, pathlib.Path, pathlib.Path, dict] | None = None
    workdir = pathlib.Path(tempfile.mkdtemp(prefix="sprite-cand-"))

    for i in range(1, args.attempts + 1):
        raw = args.keep_candidates / f"{slug}-{i}.png"
        if not generate(args.prompt, args.ref, raw):
            print(f"候选 {i}: 生图失败")
            continue

        ratio = magenta_ratio(raw)
        if ratio < MIN_MAGENTA_RATIO:
            print(f"候选 {i}: 淘汰 —— 品红底仅 {ratio:.1%}，模型没按键色画")
            continue

        cand_dir = workdir / f"cand-{i}"
        meta = process(raw, cand_dir, args)
        if meta is None:
            print(f"候选 {i}: 淘汰 —— process 失败")
            continue

        qc = meta["qc_summary"]
        edge = meta.get("source_edge_touch_frames") or []
        empty = meta.get("empty_frames") or []
        if empty:
            print(f"候选 {i}: 淘汰 —— 抠出空帧 {empty}")
            continue
        if edge:
            print(f"候选 {i}: 淘汰 —— 内容穿出格子边界 {edge}")
            continue

        # 体型一致性越好越优先；两项量纲接近，直接相加
        score = qc["body_scale_cv"] + qc["anchor_y_std"]
        print(
            f"候选 {i}: 合格  品红底 {ratio:.1%}  body_scale_cv={qc['body_scale_cv']:.4f} "
            f"anchor_y_std={qc['anchor_y_std']:.4f}  主体高 {qc['output_subject_height_mean']:.1f}  "
            f"score={score:.4f}"
        )
        if best is None or score < best[0]:
            best = (score, raw, cand_dir, meta)

    if best is None:
        print(f"\n{args.attempts} 次采样没有一张合格，请调 prompt 后重试", file=sys.stderr)
        shutil.rmtree(workdir, ignore_errors=True)
        return 1

    score, raw, cand_dir, meta = best
    if args.out_dir.exists():
        shutil.rmtree(args.out_dir)
    shutil.copytree(cand_dir, args.out_dir)
    shutil.rmtree(workdir, ignore_errors=True)

    print(f"\n采用 {raw}（score={score:.4f}）-> {args.out_dir}")
    subprocess.run([sys.executable, str(DESPILL), str(args.out_dir)], check=True)
    print("请人眼复查一遍 sheet-transparent.png：文字水印这类问题脚本判不出来。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
