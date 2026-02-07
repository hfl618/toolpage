// inventory 工具专属逻辑
document.addEventListener('DOMContentLoaded', function() {
    console.log('元器件管理工具已就绪');

    // 示例：处理删除按钮点击
    const deleteButtons = document.querySelectorAll('.btn-outline-danger');
    deleteButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            const row = this.closest('tr');
            const model = row.querySelector('.fw-bold').innerText;
            if (confirm(`确定要删除型号 ${model} 吗？`)) {
                // 这里可以调用 AJAX 删除接口
                alert('删除功能已触发（待后端对接）');
            }
        });
    });
});
