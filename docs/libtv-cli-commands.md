# LibTV CLI 命令手册

> 版本：1.0.2
> 安装路径：C:\libtv\libtv-win-x64\libtv.exe
> 整理日期：2026-06-16

---

## 安装

```bash
# Windows（手动，install.sh 不支持 Git Bash on Windows）
# 下载：https://liblibai-web-static.liblib.cloud/cli/1.0.2/libtv-windows-amd64.zip
# 解压到 C:\libtv，加入 PATH
```

---

## 一、登录

```bash
libtv login web          # 浏览器登录（推荐）——打印链接，本地回调，token 写 ~/.libtv/credentials.json
libtv login phone -p <手机号>          # 发验证码
libtv login phone -p <手机号> -c <验证码>  # 完成登录
libtv logout             # 退出，删除凭据
```

---

## 二、账户

```bash
libtv account info       # 当前登录账户 + 活跃账户（个人/团队）
libtv account list       # 所有可切换账户
libtv account use <accountId或名称>   # 切换账户
```

---

## 三、项目（画布）

```bash
libtv project list                    # 列出所有项目
libtv project create <名称>           # 新建画布项目
libtv project use <projectUUID>       # 绑定当前目录到项目（写 .libtv/project.json）
libtv project unuse                   # 解除绑定
libtv project update <uuid> --name <新名>  # 改名
```

---

## 四、分组（工作区组织）

```bash
libtv group list                      # 列出所有分组
libtv group create <组名>             # 新建分组
libtv group use <组名或ID>            # 绑定默认分组（后续命令自动套用）
libtv group unuse                     # 解除默认分组
```

---

## 五、节点（核心）

节点是画布上的最小单元：图片节点、视频节点、文本节点、脚本节点等。

```bash
# 查看
libtv node list                       # 列出所有节点
libtv node list -g <分组>             # 列出某分组下的节点

# 新建
libtv node create <节点名> -t image   # 新建图片节点
libtv node create <节点名> -t video   # 新建视频节点
libtv node create <节点名> -t text    # 新建文本节点

# 设参数 + 生成
libtv node <节点名> --prompt "提示词" -s model=可灵O3 -s ratio=9:16 --run

# 常用 --set 参数
# model=<模型名>     用 libtv model search 查名称
# ratio=9:16         画面比例
# count=2            生成数量
# settings.*         模型专属设置

# 连线（上下游节点关联）
libtv node <节点名> --left <上游节点名>    # 建入边（参考图/来源素材）
libtv node <节点名> --right <下游节点名>   # 建出边

# 删除
libtv node delete <节点名>
```

---

## 六、上传素材

```bash
libtv upload <节点名> --resource <本地文件路径>
libtv upload <节点名> -f <路径> -t image    # 明确指定类型（image/video/audio）
libtv upload <节点名> -f <路径> -g <分组>   # 挂入指定分组
```

---

## 七、下载结果

```bash
libtv download -n <节点名或ID>              # 下载到当前目录
libtv download -n <节点名> -o <输出目录>    # 指定输出目录
libtv download -n <节点名> --without-ai-watermark --vip   # 去水印（会员）
```

---

## 八、图片生成（Slash 快捷）

```bash
libtv image shortcut list               # 列出所有可 Slash 的快捷指令
libtv image shortcut <scene> -n <节点>  # 对某节点执行 Slash 快捷
```

---

## 九、脚本与分镜

```bash
libtv script storyboard <脚本节点名>    # 从脚本节点生成分镜图组
```

---

## 十、模型查询

```bash
libtv model search                      # 列出所有模型
libtv model search -t image             # 只看图片模型
libtv model search -t video             # 只看视频模型
libtv model search 可灵                 # 搜索名称含"可灵"的模型
libtv model <模型名>                    # 查该模型完整参数 schema
```

---

## 十一、典型工作流（本项目使用场景）

```bash
# 第一次初始化（每个视频任务一个项目）
libtv login web
libtv project create "任务名-20260616"
libtv project use <返回的UUID>

# 上传参考图（角色图/场景图/道具书图）
libtv upload "角色参考图" -f ./ref-character.jpg -t image
libtv upload "道具书图" -f ./ref-book.jpg -t image

# 创建生图节点 + 触发生成
libtv node create "角色生图" -t image
libtv node "角色生图" --left "角色参考图" --prompt "..." -s model=LibNavo Pro -s ratio=9:16 --run

# 创建生视频节点 + 触发生成
libtv node create "生视频" -t video
libtv node "生视频" --left "角色生图" --prompt "..." -s model=可灵O3 -s ratio=9:16 --run

# 下载结果
libtv download -n "生视频" -o ./output --without-ai-watermark --vip
```

---

## 注意事项

- **凭据存储**：`~/.libtv/credentials.json`，不要提交 git
- **项目绑定**：`.libtv/project.json` 在工作目录，不要提交 git（需加 gitignore）
- **模型名**：必须用 `libtv model search` 返回的 `modelName`，不是页面显示的中文别名
- **PATH**：在 Claude Code 会话内需 `export PATH="/c/libtv/libtv-win-x64:$PATH"`，新 PowerShell 窗口已自动含（User PATH 已设）
