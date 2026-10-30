using System;
using System.IO;
using System.IO.Compression;
using System.Diagnostics;
using System.Reflection;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text;
using System.Collections.Generic;
using System.Threading.Tasks;
using System.Windows.Forms;
using System.Drawing;
class OhMyBuddyHost {
    static int Main(string[] args) {
        if(args.Length!=3)return 2;
        var start=new ProcessStartInfo(args[0],"\""+args[1]+"\"") { UseShellExecute=false,CreateNoWindow=true,RedirectStandardOutput=true,RedirectStandardError=true,WorkingDirectory=Path.GetDirectoryName(args[1]),StandardOutputEncoding=Encoding.UTF8,StandardErrorEncoding=Encoding.UTF8 };
        using(var writer=new StreamWriter(args[2],true,new UTF8Encoding(false))) using(var child=new Process{StartInfo=start}) {
            child.OutputDataReceived+=(s,e)=>{if(e.Data!=null)lock(writer){writer.WriteLine(e.Data);writer.Flush();}};
            child.ErrorDataReceived+=(s,e)=>{if(e.Data!=null)lock(writer){writer.WriteLine(e.Data);writer.Flush();}};
            child.Start();child.BeginOutputReadLine();child.BeginErrorReadLine();child.WaitForExit();return child.ExitCode;
        }
    }
}
class OhMyBuddyInstaller {
    static string Quote(string s) {
        var b = new StringBuilder("\""); int slashes = 0;
        foreach(char c in s) { if(c=='\\') { slashes++; continue; } if(c=='\"') { b.Append('\\',slashes*2+1); b.Append(c); } else { b.Append('\\',slashes); b.Append(c); } slashes=0; }
        b.Append('\\',slashes*2); return b.Append('"').ToString();
    }
    [STAThread] static void Main(string[] args) {
        AppContext.SetSwitch("Switch.System.IO.UseLegacyPathHandling",false);
        AppContext.SetSwitch("Switch.System.IO.BlockLongPaths",false);
        Application.EnableVisualStyles();
        var form = new Form { Text="OhMyBuddy", Width=520, Height=200, StartPosition=FormStartPosition.CenterScreen, FormBorderStyle=FormBorderStyle.FixedDialog, MaximizeBox=false, MinimizeBox=false };
        var label = new Label { Text="正在解压 OhMyBuddy 安装文件…", AutoSize=false, Left=28, Top=28, Width=455, Height=35, Font=new Font("Microsoft YaHei UI",13) };
        var hint = new Label { Text="校验和复制可能需要几分钟，请保持窗口打开。",Left=30, Top=68, Width=455, Height=28 };
        var progress = new ProgressBar { Left=30, Top=110, Width=445, Height=15, Style=ProgressBarStyle.Marquee };
        form.Controls.AddRange(new Control[]{label,hint,progress}); bool finished=false;
        Action<string> report = line => {
            if(line==null || !line.StartsWith("OHMYBUDDY_INSTALL_PROGRESS\t"))return;
            string[] fields=line.Split('\t');int done,total;
            if(fields.Length!=4 || !int.TryParse(fields[2],out done) || !int.TryParse(fields[3],out total) || total<1 || done<0 || done>total)return;
            string text=fields[1]=="validate"?"正在校验安装文件":fields[1]=="copy"?"正在复制安装文件":fields[1]=="probe"?"正在检查运行环境":fields[1]=="service"?"正在启动 OhMyBuddy":fields[1]=="ready"?"准备好了":"";
            if(text.Length==0)return;
            form.BeginInvoke(new Action(()=>{progress.Style=ProgressBarStyle.Continuous;progress.Value=(int)(100L*done/total);label.Text=text+(fields[1]=="validate"||fields[1]=="copy"?"（"+progress.Value+"%）":"…");}));
        };
        form.FormClosing += (sender,e) => { if(!finished)e.Cancel=true; };
        form.Shown += async (sender,e) => {
            string root=Path.Combine(Path.GetTempPath(),"OhMyBuddy-install-"+Guid.NewGuid().ToString("N"));
            try {
                await Task.Run(() => {
                    Directory.CreateDirectory(root); var acl=new DirectorySecurity(); acl.SetAccessRuleProtection(true,false);
                    foreach(var sid in new SecurityIdentifier[]{WindowsIdentity.GetCurrent().User,new SecurityIdentifier(WellKnownSidType.LocalSystemSid,null)}) acl.AddAccessRule(new FileSystemAccessRule(sid,FileSystemRights.FullControl,InheritanceFlags.ContainerInherit|InheritanceFlags.ObjectInherit,PropagationFlags.None,AccessControlType.Allow));
                    Directory.SetAccessControl(root,acl);
                    string zip=Path.Combine(root,"payload.zip");
                    using(var input=Assembly.GetExecutingAssembly().GetManifestResourceStream("ohmybuddy-payload")) using(var output=new FileStream(zip,FileMode.CreateNew)) input.CopyTo(output);
                    ZipFile.ExtractToDirectory(zip,root); File.Delete(zip);
                    string[] dirs=Directory.GetDirectories(root); if(dirs.Length!=1)throw new Exception("安装包目录异常。");
                    string payload=dirs[0], log=Path.Combine(root,"installation.log");
                    var command=new StringBuilder(Quote(Path.Combine(payload,"scripts","platform-bootstrap.cjs"))+" "+Quote(payload)); foreach(string arg in args)command.Append(" ").Append(Quote(arg));
                    var start=new ProcessStartInfo(Path.Combine(payload,"runtime","node.exe"),command.ToString()) { UseShellExecute=false,CreateNoWindow=true,RedirectStandardOutput=true,RedirectStandardError=true,WorkingDirectory=payload,StandardOutputEncoding=Encoding.UTF8,StandardErrorEncoding=Encoding.UTF8 };
                    using(var writer=new StreamWriter(log,false,new UTF8Encoding(false))) using(var process=new Process { StartInfo=start }) {
                        process.OutputDataReceived+=(s,line)=>{if(line.Data!=null){lock(writer){writer.WriteLine(line.Data);writer.Flush();}report(line.Data);}};
                        process.ErrorDataReceived+=(s,line)=>{if(line.Data!=null)lock(writer){writer.WriteLine(line.Data);writer.Flush();}};
                        process.Start();process.BeginOutputReadLine();process.BeginErrorReadLine();process.WaitForExit();
                        if(process.ExitCode!=0)throw new Exception("安装未完成，已准备的文件保留。请查看日志，不要重复覆盖安装：\n"+log);
                    }
                });
                try { Directory.Delete(root,true); } catch { }
            } catch(Exception error) { Environment.ExitCode=1; MessageBox.Show(error.Message,"OhMyBuddy",MessageBoxButtons.OK,MessageBoxIcon.Warning); }
            finished=true;form.Close();
        };
        Application.Run(form);
    }
}
