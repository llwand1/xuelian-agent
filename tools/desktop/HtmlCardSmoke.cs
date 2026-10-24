using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

/** Synthetic sandbox test. Loads the installed bridge's source predicate by reflection;
 * never calls capture/files/workspace handlers or touches the installed app's profile. */
internal static class HtmlCardSmoke
{
    private static int checks, exit = 1;
    private static void Check(bool pass, string why) { if (!pass) throw new Exception(why); checks++; Console.WriteLine("PASS " + why); }
    [STAThread] private static int Main(string[] args)
    {
        Application.EnableVisualStyles();
        using (Form form = new Form()) using (WebView2 view = new WebView2())
        {
            form.ClientSize = new Size(720, 650); form.StartPosition = FormStartPosition.Manual;
            form.Location = new Point(-30000, -30000); view.Dock = DockStyle.Fill; form.Controls.Add(view);
            form.Shown += async delegate
            {
                try
                {
                    string url = args[1], evidence = args[2];
                    var flags = BindingFlags.Static | BindingFlags.NonPublic;
                    Type launcher = Assembly.LoadFrom(args[0]).GetType("Launcher", true);
                    launcher.GetField("Port", flags).SetValue(null, new Uri(url).Port);
                    MethodInfo guard = launcher.GetMethod("IsLocalMessage", flags);
                    Func<string, bool> allowed = source => (bool)guard.Invoke(null, new object[] { source });
                    Check(allowed(url) && !allowed("about:srcdoc") && !allowed("null"), "Installed bridge predicate rejects srcdoc and opaque origins");
                    var options = new CoreWebView2EnvironmentOptions("--disable-backgrounding-occluded-windows --disable-renderer-backgrounding");
                    var env = await CoreWebView2Environment.CreateAsync(null, Path.Combine(evidence, "profile"), options);
                    await view.EnsureCoreWebView2Async(env);
                    int nativeTopMessages = 0, childNativeMessages = 0, trustedChildMessages = 0, popups = 0;
                    CoreWebView2Frame child = null;
                    view.CoreWebView2.WebMessageReceived += delegate { nativeTopMessages++; };
                    view.CoreWebView2.FrameCreated += delegate(object sender, CoreWebView2FrameCreatedEventArgs e)
                    {
                        child = e.Frame;
                        // Diagnostic observer ONLY: the real Launcher never subscribes a frame to its native dispatcher.
                        e.Frame.WebMessageReceived += delegate(object s, CoreWebView2WebMessageReceivedEventArgs message)
                        {
                            childNativeMessages++; if (allowed(message.Source)) trustedChildMessages++;
                        };
                    };
                    view.CoreWebView2.NewWindowRequested += delegate(object s, CoreWebView2NewWindowRequestedEventArgs e) { popups++; e.Handled = true; };
                    view.CoreWebView2.Navigate(url + "/demo");
                    await Wait(view, "window.fixtureReady===true");
                    Check(child != null && await child.ExecuteScriptAsync("window.fixtureStarted===1 && !!document.querySelector('canvas')") == "true", "WebView2 executes the real wrapped full-document HTML and Canvas");
                    string first = await child.ExecuteScriptAsync("getComputedStyle(document.querySelector('.bob')).transform");
                    await Task.Delay(280);
                    Check(first != await child.ExecuteScriptAsync("getComputedStyle(document.querySelector('.bob')).transform"), "WebView2 CSS animation advances without a new window");
                    await child.ExecuteScriptAsync("document.querySelector('#toggle').click()");
                    Check(await child.ExecuteScriptAsync("document.querySelector('#state').textContent") == "\"已暂停\"", "Card-local interactive button works in WebView2");
                    using (var shot = File.Create(Path.Combine(evidence, "webview2.png"))) await view.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png, shot);
                    view.CoreWebView2.Navigate(url + "/attack");
                    await Wait(view, "!!window.fixtureResult");
                    string result = await view.CoreWebView2.ExecuteScriptAsync("window.fixtureResult");
                    var values = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(result);
                    Check((bool)values["parent"] && (bool)values["storage"] && (bool)values["popup"] && (bool)values["fetch"], "WebView2 blocks parent DOM, storage, popups and fetch");
                    await Task.Delay(400);
                    Check(nativeTopMessages == 0, "Untrusted iframe cannot reach the actual top-level native message channel");
                    Check(trustedChildMessages == 0, "Even observed child bridge messages fail the installed source predicate");
                    Check(popups == 0, "Sandbox never requests a native popup window");
                    File.WriteAllText(Path.Combine(evidence, "native-result.json"), new JavaScriptSerializer().Serialize(new { checks = checks, nativeTopMessages = nativeTopMessages, childNativeMessages = childNativeMessages, trustedChildMessages = trustedChildMessages, result = values }));
                    Console.WriteLine("Native HTML sandbox: " + checks + " assertions passed"); exit = 0;
                }
                catch (Exception e) { Console.Error.WriteLine(e); exit = 1; }
                finally { form.Close(); }
            };
            Application.Run(form);
        }
        return exit;
    }
    private static async Task Wait(WebView2 view, string expression)
    {
        for (int i = 0; i < 100; i++) { if (await view.CoreWebView2.ExecuteScriptAsync(expression) == "true") return; await Task.Delay(100); }
        throw new Exception("WebView2 fixture timed out: " + expression);
    }
}
